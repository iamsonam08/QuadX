
import { GoogleGenAI, Type } from "@google/genai";
import { AppData } from "../types";

// Explicitly declare process for the compiler to prevent 'process is not defined'
declare var process: { env: { [key: string]: string | undefined } };

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * VPai Chat Assistant - Optimized for QuadX context
 */
export async function askVPai(question: string, context: AppData) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: question,
      config: {
        systemInstruction: `You are VPai, the official AI assistant for QuadX College. 

        KNOWLEDGE BASE:
        ${JSON.stringify(context)}

        OPERATIONAL PROTOCOLS:
        1. BE CONCISE: Limit responses to 1-2 sentences. 
        2. BE ACCURATE: Use the KNOWLEDGE BASE strictly for college-specific answers.
        3. BRANDING: You represent QuadX. Be helpful, modern, and energetic.
        4. ACCESSIBILITY: Branches supported: Comp, IT, Civil, Mech, Elect, AIDS, E&TC.`,
        temperature: 0.4,
      }
    });

    return response.text?.trim() || "I'm not quite sure about that. Try asking something else! 🎓";
  } catch (error) {
    console.error("VPai Connection Error:", error);
    return "I'm having a connection hiccup. Let's try again! ⚡";
  }
}

/**
 * AI Image Stylization for Campus Map
 */
export async function stylizeMapImage(imageBase64: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64.split(',')[1],
              mimeType: 'image/png',
            },
          },
          {
            text: 'Transform this campus map into a vibrant, clean, simplified vector animation style. Use QuadX colors: Neon Blue, Deep Purple, and Emerald. Maintain the exact spatial layout but remove clutter. DO NOT add text.',
          },
        ],
      },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) {
    console.error("Map Stylization Error:", error);
    return null;
  }
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
            }
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

/**
 * Extracts structured data from text, image, or PDF using Gemini
 */
export async function extractCategoryData(category: string, content: string, mimeType: string = "text/plain") {
  const schema = CATEGORY_SCHEMAS[category];
  if (!schema) return [];

  const parts: any[] = [{ text: `Task: Extract JSON data for the ${category} section of QuadX College. The input may be messy text, a spreadsheet snippet, or an image. Format the output strictly as JSON based on the schema provided.` }];

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    parts.push({
      inlineData: {
        data: content.includes(',') ? content.split(',')[1] : content,
        mimeType: mimeType
      }
    });
  } else {
    parts.push({ text: `INPUT SOURCE DATA:\n${content}` });
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

    const parsed = JSON.parse(response.text || '[]');
    return parsed.map((item: any) => ({
      ...item,
      id: generateId(),
      slots: item.slots ? item.slots.map((s: any) => ({ ...s, id: generateId() })) : undefined
    }));
  } catch (error) {
    console.error("AI Extraction Error:", error);
    return [];
  }
}
