
import { GoogleGenAI, Type } from "@google/genai";
import { AppData } from "../types";

declare var process: { env: { [key: string]: string | undefined } };

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * VPai Chat Assistant
 * Context-aware AI that strictly uses the provided AppData to answer questions.
 */
export async function askVPai(question: string, context: AppData) {
  try {
    // Clean context to remove large image strings for token efficiency
    const cleanContext = {
      attendance: context.attendance,
      timetable: context.timetable,
      exams: context.exams,
      scholarships: context.scholarships,
      internships: context.internships,
      events: context.events,
      complaints: context.complaints.map(c => ({ text: c.text, status: c.status }))
    };
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: question,
      config: {
        systemInstruction: `You are VPai, the official AI for QuadX College. 
        
        KNOWLEDGE BASE (This is your ONLY source of truth):
        ${JSON.stringify(cleanContext, null, 2)}
        
        PROTOCOLS:
        1. SEARCH: Scan ALL categories in the KNOWLEDGE BASE (timetable, scholarships, exams, etc.) to find the answer.
        2. STRICTNESS: If the info is NOT in the JSON above, say: "I don't have that in my records. Please ask the office."
        3. FORMATTING: Use **bold** for key dates, names, or room numbers.
        4. BREVITY: Max 2-3 sentences. 
        5. TONE: Professional, helpful, and energetic.`,
        temperature: 0.1,
      }
    });

    const text = response.text?.trim();
    if (!text) throw new Error("Empty AI response");
    return text;
  } catch (error) {
    console.error("VPai Error:", error);
    return "I'm having a connection issue with the campus database. Please try again in a moment.";
  }
}

/**
 * Robust JSON Extraction for Admin Portal
 * This turns messy text/images/spreadsheets into the exact JSON format the app needs.
 */
export async function extractCategoryData(category: string, content: string, mimeType: string = "text/plain") {
  const schema = CATEGORY_SCHEMAS[category];
  if (!schema) return [];

  const prompt = `Task: Extract data for the '${category}' category from the provided content. 
  - Output MUST be a valid JSON ARRAY of objects.
  - Normalise terminology: 'FE'->'1st Year', 'SE'->'2nd Year', 'TE'->'3rd Year', 'BE'->'4th Year'.
  - Terminology: 'Comp' / 'CS' / 'Computer' -> 'Comp'.
  - If it's a Timetable, identify Day, Branch, Year, Div and then ALL Lecture slots.
  - Return an empty array [] if no relevant data is found.`;

  const parts: any[] = [{ text: prompt }];

  if (mimeType.startsWith('image/')) {
    parts.push({
      inlineData: {
        data: content.includes(',') ? content.split(',')[1] : content,
        mimeType: mimeType
      }
    });
  } else {
    parts.push({ text: `CONTENT TO ANALYZE:\n${content}` });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const rawJson = JSON.parse(response.text || '[]');
    console.log(`AI Extracted for ${category}:`, rawJson);

    // Deep mapping to ensure IDs exist for every nested item
    return rawJson.map((item: any) => ({
      ...item,
      id: generateId(),
      slots: item.slots ? item.slots.map((s: any) => ({ ...s, id: generateId() })) : undefined
    }));
  } catch (error) {
    console.error(`Extraction failed for ${category}:`, error);
    return [];
  }
}

export async function stylizeMapImage(imageBase64: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
          { text: 'Redraw this campus map into a vibrant, neon-lit, 3D vector style. Remove all text labels. Keep the geometry exactly same.' }
        ]
      }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (e) { return null; }
}

const CATEGORY_SCHEMAS: Record<string, any> = {
  'TIMETABLE': {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        day: { type: Type.STRING },
        branch: { type: Type.STRING },
        year: { type: Type.STRING },
        division: { type: Type.STRING },
        slots: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              subject: { type: Type.STRING },
              room: { type: Type.STRING },
              color: { type: Type.STRING }
            },
            required: ["time", "subject", "room"]
          }
        }
      },
      required: ["day", "branch", "year", "division", "slots"]
    }
  },
  'SCHOLARSHIP': {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        amount: { type: Type.STRING },
        deadline: { type: Type.STRING },
        eligibility: { type: Type.STRING },
        category: { type: Type.STRING }
      },
      required: ["name", "amount", "deadline", "eligibility", "category"]
    }
  },
  'EVENT': {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        date: { type: Type.STRING },
        venue: { type: Type.STRING },
        description: { type: Type.STRING },
        category: { type: Type.STRING }
      },
      required: ["title", "date", "venue", "description", "category"]
    }
  },
  'EXAM': {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        subject: { type: Type.STRING },
        date: { type: Type.STRING },
        time: { type: Type.STRING },
        venue: { type: Type.STRING },
        branch: { type: Type.STRING },
        year: { type: Type.STRING },
        division: { type: Type.STRING }
      },
      required: ["subject", "date", "time", "venue", "branch", "year", "division"]
    }
  },
  'INTERNSHIP': {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        company: { type: Type.STRING },
        role: { type: Type.STRING },
        location: { type: Type.STRING },
        stipend: { type: Type.STRING },
        branch: { type: Type.STRING },
        year: { type: Type.STRING }
      },
      required: ["company", "role", "location", "stipend", "branch", "year"]
    }
  }
};
