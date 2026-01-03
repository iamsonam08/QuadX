
import React, { useState, useRef } from 'react';
import { AppData, TimetableEntry, ExamSchedule, ScholarshipItem, InternshipItem, CampusEvent, Complaint } from '../../types';
import { extractCategoryData, stylizeMapImage } from '../../services/geminiService';
import { PersistenceService } from '../../services/persistenceService';
import Logo from '../Logo';
import * as XLSX from 'xlsx';

interface AdminPanelProps {
  appData: AppData;
  setAppData: (data: AppData | ((prev: AppData) => AppData)) => void;
  onExit: () => void;
}

type AdminCategory = 'TIMETABLE' | 'SCHOLARSHIP' | 'EVENT' | 'EXAM' | 'INTERNSHIP' | 'CAMPUS_MAP' | 'COMPLAINTS' | 'SYSTEM';

const CATEGORY_MAP: Record<string, { label: string, icon: string, color: string, dataKey?: keyof AppData }> = {
  TIMETABLE: { label: 'Timetable', icon: 'fa-calendar-week', color: 'text-indigo-400', dataKey: 'timetable' },
  SCHOLARSHIP: { label: 'Scholarship', icon: 'fa-graduation-cap', color: 'text-amber-400', dataKey: 'scholarships' },
  EVENT: { label: 'Event Info', icon: 'fa-masks-theater', color: 'text-pink-400', dataKey: 'events' },
  EXAM: { label: 'Exam Info', icon: 'fa-file-signature', color: 'text-rose-400', dataKey: 'exams' },
  INTERNSHIP: { label: 'Internship', icon: 'fa-briefcase', color: 'text-cyan-400', dataKey: 'internships' },
  CAMPUS_MAP: { label: 'Campus Map', icon: 'fa-map-location-dot', color: 'text-lime-400', dataKey: 'rawKnowledge' },
  COMPLAINTS: { label: 'Student Complaints', icon: 'fa-box-archive', color: 'text-slate-400', dataKey: 'complaints' },
  SYSTEM: { label: 'Cloud Sync', icon: 'fa-cloud-arrow-up', color: 'text-blue-400' },
};

const compressImage = (base64Str: string, maxWidth: number = 768): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.4));
    };
  });
};

const AdminPanel: React.FC<AdminPanelProps> = ({ appData, setAppData, onExit }) => {
  const [selectedCategory, setSelectedCategory] = useState<AdminCategory | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;

    setIsProcessing(true);
    setStatusMsg(`Reading ${file.name}...`);

    const reader = new FileReader();
    const isSpreadsheet = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
    const isText = file.name.endsWith('.txt');
    const isVisual = file.type.startsWith('image/') || file.type === 'application/pdf';

    reader.onload = async (event) => {
      try {
        let content = '';
        let finalMimeType = file.type;

        if (selectedCategory === 'CAMPUS_MAP' && file.type.startsWith('image/')) {
          const optimized = await compressImage(event.target?.result as string);
          setStatusMsg('AI Stylizing Map...');
          const stylized = await stylizeMapImage(optimized);
          const finalStylized = stylized ? await compressImage(stylized) : undefined;
          setAppData(prev => ({ ...prev, campusMapImage: optimized, stylizedMapImage: finalStylized }));
          setStatusMsg("Map Updated!");
        } else if (isSpreadsheet) {
          setStatusMsg('Converting Spreadsheet...');
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          content = JSON.stringify(json);
          finalMimeType = 'application/json';
        } else if (isText) {
          content = event.target?.result as string;
          finalMimeType = 'text/plain';
        } else if (isVisual) {
          content = event.target?.result as string;
        }

        if (content && selectedCategory !== 'CAMPUS_MAP') {
          setStatusMsg('Gemini AI Extracting...');
          const extracted = await extractCategoryData(selectedCategory, content, finalMimeType);
          if (extracted?.length) {
            updateAppData(selectedCategory as AdminCategory, extracted);
            setStatusMsg('Success!');
          } else {
            setStatusMsg('No data found.');
          }
        }
      } catch (err) {
        setStatusMsg('Error processing file.');
      } finally {
        setIsProcessing(false);
        setTimeout(() => setStatusMsg(''), 2000);
      }
    };

    if (isSpreadsheet) reader.readAsArrayBuffer(file);
    else if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  };

  const updateAppData = (category: AdminCategory, items: any[]) => {
    setAppData(prev => {
      const key = CATEGORY_MAP[category].dataKey;
      if (!key) return prev;
      return { ...prev, [key]: [...(prev[key] as any[]), ...items] };
    });
  };

  const toggleComplaintStatus = (id: string) => {
    setAppData(prev => ({
      ...prev,
      complaints: prev.complaints.map(c => 
        c.id === id ? { ...c, status: c.status === 'PENDING' ? 'RESOLVED' : 'PENDING' } : c
      )
    }));
  };

  const deleteItem = (category: AdminCategory, id: string) => {
    const key = CATEGORY_MAP[category].dataKey;
    if (!key) return;
    setAppData(prev => ({
      ...prev,
      [key]: (prev[key] as any[]).filter(i => i.id !== id)
    }));
  };

  const deployToGlobal = async () => {
    setIsProcessing(true);
    setStatusMsg('Syncing Globally...');
    const success = await PersistenceService.saveData(appData);
    setStatusMsg(success ? 'SYNCED! 🚀' : 'Payload too large');
    setTimeout(() => { setIsProcessing(false); setStatusMsg(''); }, 3000);
  };

  const renderManagementView = (catKey: AdminCategory) => {
    if (catKey === 'SYSTEM') {
      return (
        <div className="space-y-6 animate-fadeIn">
          <button onClick={() => setSelectedCategory(null)} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-blue-400 border border-slate-800"><i className="fa-solid fa-chevron-left"></i></button>
          <div className="bg-slate-900 p-8 rounded-[3rem] text-center border border-slate-800">
            <h3 className="text-xl font-black text-white uppercase mb-4">Cloud Deployment</h3>
            <button onClick={deployToGlobal} disabled={isProcessing} className="w-full py-6 bg-blue-600 rounded-[2rem] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-500/20 active:scale-95 transition-all">
              {isProcessing ? 'Syncing...' : 'Deploy to Students'}
            </button>
          </div>
        </div>
      );
    }

    if (catKey === 'COMPLAINTS') {
      return (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between">
            <button onClick={() => setSelectedCategory(null)} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-blue-400 border border-slate-800"><i className="fa-solid fa-chevron-left"></i></button>
            <h3 className="text-lg font-black text-white uppercase">Reports</h3>
            <div className="w-10"></div>
          </div>
          <div className="space-y-4">
            {appData.complaints.length === 0 ? (
              <div className="bg-slate-900 p-16 rounded-[3rem] text-center border border-slate-800">
                <i className="fa-solid fa-check-double text-4xl text-emerald-500/20 mb-4"></i>
                <p className="text-[10px] font-black text-slate-500 uppercase">All clear!</p>
              </div>
            ) : (
              appData.complaints.map(c => (
                <div key={c.id} className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${c.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                      {c.status}
                    </span>
                    <span className="text-[8px] font-black text-slate-500 uppercase">{c.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium leading-relaxed">{c.text}</p>
                  <div className="flex gap-2">
                    <button onClick={() => toggleComplaintStatus(c.id)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-700">
                      Toggle Status
                    </button>
                    <button onClick={() => deleteItem('COMPLAINTS', c.id)} className="w-12 py-3 bg-rose-500/10 text-rose-500 rounded-2xl">
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    const cat = CATEGORY_MAP[catKey];
    const items = cat.dataKey ? (appData[cat.dataKey] as any[]) : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedCategory(null)} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-blue-400 border border-slate-800"><i className="fa-solid fa-chevron-left"></i></button>
          <h3 className="text-lg font-black text-white uppercase">{cat.label} Hub</h3>
          <div className="w-10"></div>
        </div>
        <div className="bg-slate-900 border-2 border-slate-800 border-dashed rounded-[3rem] p-10 text-center relative group overflow-hidden">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-all"><i className="fa-solid fa-cloud-arrow-up text-3xl"></i></button>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload Data File</p>
          <p className="text-[8px] text-slate-600 font-bold mt-2 uppercase">PDF, Image, Excel, CSV, TXT</p>
        </div>
        <div className="space-y-3">
          {items.map((item: any) => (
            <div key={item.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-300 uppercase truncate pr-4">{item.subject || item.name || item.title || item.day}</span>
              <button onClick={() => deleteItem(catKey, item.id)} className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500"><i className="fa-solid fa-trash-can text-xs"></i></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto font-['Outfit']">
      <header className="p-8 border-b border-slate-900 flex justify-between items-center sticky top-0 bg-slate-950/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3"><Logo className="w-12 h-12" /><h1 className="text-xl font-black text-blue-500">ADMIN</h1></div>
        <button onClick={onExit} className="bg-slate-900 w-11 h-11 rounded-2xl flex items-center justify-center text-rose-500 shadow-lg"><i className="fa-solid fa-power-off"></i></button>
      </header>
      <main className="flex-1 p-6 overflow-y-auto pb-32 no-scrollbar">
        {selectedCategory ? renderManagementView(selectedCategory) : (
          <div className="space-y-6">
            <button onClick={() => setSelectedCategory('SYSTEM')} className="w-full bg-gradient-to-br from-blue-600 to-indigo-800 p-10 rounded-[4rem] text-left relative overflow-hidden group shadow-2xl">
              <div className="relative z-10">
                <p className="text-blue-200 text-[8px] font-black uppercase tracking-widest mb-2">Sync Control</p>
                <h2 className="text-3xl font-black text-white tracking-tighter">Broadcast to<br/>Everyone</h2>
              </div>
              <i className="fa-solid fa-satellite-dish absolute -right-4 -bottom-4 text-8xl text-white/10 group-hover:scale-125 transition-transform duration-700"></i>
            </button>
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(CATEGORY_MAP).filter(k => k !== 'SYSTEM') as AdminCategory[]).map(key => (
                <button key={key} onClick={() => setSelectedCategory(key)} className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] flex flex-col items-center justify-center group hover:border-blue-500 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-4"><i className={`fa-solid ${CATEGORY_MAP[key].icon} text-lg ${CATEGORY_MAP[key].color}`}></i></div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{CATEGORY_MAP[key].label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      {statusMsg && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-8 py-4 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl z-50 animate-bounce">
          {statusMsg}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
