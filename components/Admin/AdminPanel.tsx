
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
  COMPLAINTS: { label: 'Complaints', icon: 'fa-box-archive', color: 'text-slate-400', dataKey: 'complaints' },
  SYSTEM: { label: 'Cloud Sync', icon: 'fa-cloud-arrow-up', color: 'text-blue-400' },
};

const AdminPanel: React.FC<AdminPanelProps> = ({ appData, setAppData, onExit }) => {
  const [selectedCategory, setSelectedCategory] = useState<AdminCategory | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [manualText, setManualText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;

    setIsProcessing(true);
    setStatusMsg(`Uploading ${file.name}...`);

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsv = file.name.endsWith('.csv');

    reader.onload = async (event) => {
      let content = '';
      let mimeType = file.type;

      try {
        if (selectedCategory === 'CAMPUS_MAP' && file.type.startsWith('image/')) {
          const base64 = event.target?.result as string;
          setStatusMsg('Stylizing Map (AI Design)...');
          const stylized = await stylizeMapImage(base64);
          setAppData(prev => ({ ...prev, campusMapImage: base64, stylizedMapImage: stylized || undefined }));
          setStatusMsg(stylized ? "Futuristic Map Ready!" : "Map Uploaded!");
          setIsProcessing(false);
          return;
        }

        if (isExcel || isCsv) {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: isExcel ? 'array' : 'binary' });
          const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
          content = JSON.stringify(json);
          mimeType = 'application/json';
        } else {
          content = event.target?.result as string;
        }

        setStatusMsg('AI Parsing Data...');
        const extracted = await extractCategoryData(selectedCategory as string, content, mimeType);
        
        if (extracted && extracted.length > 0) {
          updateAppData(selectedCategory as any, extracted);
          setStatusMsg('Data Ready for Deployment!');
        } else {
          setStatusMsg('Extraction failed.');
        }
      } catch (err) {
        setStatusMsg('Error processing file.');
      } finally {
        setTimeout(() => { setIsProcessing(false); setStatusMsg(''); }, 2000);
      }
    };

    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsDataURL(file);
  };

  const updateAppData = (category: AdminCategory, items: any[]) => {
    setAppData(prev => {
      const newData = { ...prev };
      const key = CATEGORY_MAP[category].dataKey;
      if (!key) return newData;

      if (category === 'TIMETABLE') {
        items.forEach((entry: TimetableEntry) => {
          const idx = newData.timetable.findIndex(t => t.day === entry.day && t.branch === entry.branch && t.year === entry.year);
          if (idx !== -1) newData.timetable[idx].slots = [...newData.timetable[idx].slots, ...entry.slots];
          else newData.timetable.push(entry);
        });
      } else {
        (newData[key] as any) = [...(newData[key] as any), ...items];
      }
      return newData;
    });
  };

  const deployToGlobal = async () => {
    setIsProcessing(true);
    setStatusMsg('Deploying to Global Students...');
    const success = await PersistenceService.saveData(appData);
    if (success) {
      setStatusMsg('DEPLOYED SUCCESSFULLY! 🚀');
    } else {
      setStatusMsg('Deployment Failed.');
    }
    setTimeout(() => { setIsProcessing(false); setStatusMsg(''); }, 3000);
  };

  const renderSystemView = () => (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 text-center">
        <div className="w-20 h-20 bg-blue-600/10 text-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <i className="fa-solid fa-earth-americas text-4xl animate-spin-slow"></i>
        </div>
        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Global Deployment</h3>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 leading-relaxed">
          Pushing updates here will sync data to ALL devices using this QuadX link globally.
        </p>
      </div>

      <button 
        onClick={deployToGlobal}
        disabled={isProcessing}
        className="w-full py-8 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl shadow-blue-500/20 active:scale-95 transition-all flex flex-col items-center gap-2"
      >
        <i className="fa-solid fa-rocket text-2xl"></i>
        <span>{isProcessing ? 'Connecting...' : 'Deploy to Students'}</span>
      </button>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] text-center">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
          <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">Connected</p>
        </div>
        <button 
          onClick={() => { if(confirm("Reset entire global database?")) PersistenceService.resetGlobal() }}
          className="bg-slate-900 border border-rose-500/20 p-6 rounded-[2.5rem] text-center"
        >
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Database</p>
          <p className="text-xs font-black text-rose-500 uppercase tracking-widest">Wipe Cloud</p>
        </button>
      </div>
    </div>
  );

  const renderManagementView = (catKey: AdminCategory) => {
    if (catKey === 'SYSTEM') return renderSystemView();
    
    const cat = CATEGORY_MAP[catKey];
    const items = cat.dataKey ? (appData[cat.dataKey] as any[]) : [];

    return (
      <div className="space-y-6 animate-slideUp">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedCategory(null)} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-blue-400 border border-slate-800">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <h3 className="text-lg font-black text-white uppercase tracking-tighter">{cat.label} Management</h3>
          <div className="w-10"></div>
        </div>

        <div className="bg-slate-900 border-2 border-slate-800 border-dashed rounded-[3rem] p-10 text-center relative group overflow-hidden">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-all">
            <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
          </button>
          <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">Upload Data File</h4>
          <p className="text-[8px] text-slate-600 font-black mt-2 uppercase">Supports Excel, PDF, Images</p>
        </div>

        <div className="space-y-3">
          {items.map((item: any) => (
            <div key={item.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-300 uppercase truncate pr-4">{item.subject || item.name || item.title || item.day}</span>
              <button onClick={() => setAppData(prev => ({...prev, [cat.dataKey!]: (prev[cat.dataKey!] as any[]).filter(i => i.id !== item.id)}))} 
                className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500"><i className="fa-solid fa-trash-can text-xs"></i></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto font-['Outfit']">
      <header className="p-8 border-b border-slate-900 flex justify-between items-center sticky top-0 bg-slate-950/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3"><Logo className="w-12 h-12" /><h1 className="text-xl font-black tracking-tighter text-blue-500">ADMIN CONTROL</h1></div>
        <button onClick={onExit} className="bg-slate-900 w-11 h-11 rounded-2xl flex items-center justify-center text-rose-500"><i className="fa-solid fa-power-off"></i></button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto pb-32 no-scrollbar">
        {selectedCategory ? renderManagementView(selectedCategory) : (
          <div className="space-y-6">
            <button onClick={() => setSelectedCategory('SYSTEM')} className="w-full bg-gradient-to-br from-blue-600 to-indigo-800 p-10 rounded-[4rem] text-left relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-blue-200 text-[8px] font-black uppercase tracking-widest mb-2">Network Hub</p>
                <h2 className="text-3xl font-black text-white leading-none tracking-tighter">Deploy Changes<br/>Globally</h2>
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

      <style>{`
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default AdminPanel;
