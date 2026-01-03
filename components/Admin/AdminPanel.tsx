
import React, { useState, useRef } from 'react';
import { AppData, TimetableEntry, ExamSchedule, ScholarshipItem, InternshipItem, CampusEvent, Complaint } from '../../types';
import { extractCategoryData, stylizeMapImage } from '../../services/geminiService';
import Logo from '../Logo';
import * as XLSX from 'xlsx';

interface AdminPanelProps {
  appData: AppData;
  setAppData: (data: AppData | ((prev: AppData) => AppData)) => void;
  onExit: () => void;
}

type AdminCategory = 'TIMETABLE' | 'SCHOLARSHIP' | 'EVENT' | 'EXAM' | 'INTERNSHIP' | 'CAMPUS_MAP' | 'COMPLAINTS';

const CATEGORY_MAP: Record<AdminCategory, { label: string, icon: string, color: string, dataKey: keyof AppData }> = {
  TIMETABLE: { label: 'Timetable', icon: 'fa-calendar-week', color: 'text-indigo-400', dataKey: 'timetable' },
  SCHOLARSHIP: { label: 'Scholarship', icon: 'fa-graduation-cap', color: 'text-amber-400', dataKey: 'scholarships' },
  EVENT: { label: 'Event Info', icon: 'fa-masks-theater', color: 'text-pink-400', dataKey: 'events' },
  EXAM: { label: 'Exam Info', icon: 'fa-file-signature', color: 'text-rose-400', dataKey: 'exams' },
  INTERNSHIP: { label: 'Internship', icon: 'fa-briefcase', color: 'text-cyan-400', dataKey: 'internships' },
  CAMPUS_MAP: { label: 'Campus Map', icon: 'fa-map-location-dot', color: 'text-lime-400', dataKey: 'rawKnowledge' },
  COMPLAINTS: { label: 'Complaints', icon: 'fa-box-archive', color: 'text-slate-400', dataKey: 'complaints' },
};

const AdminPanel: React.FC<AdminPanelProps> = ({ appData, setAppData, onExit }) => {
  const [selectedCategory, setSelectedCategory] = useState<AdminCategory | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [manualText, setManualText] = useState('');
  const [gDocUrl, setGDocUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;

    setIsProcessing(true);
    setStatusMsg(`Uploading ${file.name}...`);

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsv = file.name.endsWith('.csv');
    const isPdf = file.type === 'application/pdf';

    reader.onload = async (event) => {
      let content = '';
      let mimeType = file.type;

      try {
        if (selectedCategory === 'CAMPUS_MAP' && file.type.startsWith('image/')) {
          const base64 = event.target?.result as string;
          
          setStatusMsg('Stylizing Map (AI Design)...');
          const stylized = await stylizeMapImage(base64);
          
          setAppData(prev => ({ 
            ...prev, 
            campusMapImage: base64,
            stylizedMapImage: stylized || undefined 
          }));
          
          // Fix: Use double quotes for the status message to avoid syntax error with unescaped single quote in "Sync'd"
          setStatusMsg(stylized ? "Futuristic Map Sync'd!" : "Map Uploaded!");
          setIsProcessing(false);
          return;
        }

        if (isExcel || isCsv) {
          setStatusMsg('Parsing Spreadsheet...');
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: isExcel ? 'array' : 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          content = JSON.stringify(json, null, 2);
          mimeType = 'application/json';
        } else if (isPdf || file.type.startsWith('image/')) {
          content = event.target?.result as string;
        } else {
          content = event.target?.result as string;
        }

        setStatusMsg('AI Syncing to All Devices...');
        const extracted = await extractCategoryData(selectedCategory, content, mimeType);
        
        if (extracted && extracted.length > 0) {
          updateAppData(selectedCategory, extracted);
          setStatusMsg('Global Deployment Successful!');
        } else {
          setStatusMsg('Extraction failed.');
        }
      } catch (err) {
        console.error(err);
        setStatusMsg('Sync Error.');
      } finally {
        setTimeout(() => { setIsProcessing(false); setStatusMsg(''); }, 2000);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else if (isPdf || file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleManualUpload = async () => {
    if (!manualText.trim() || !selectedCategory) return;
    setIsProcessing(true);
    setStatusMsg('Broadcasting Changes...');
    try {
      const extracted = await extractCategoryData(selectedCategory, manualText);
      if (extracted && extracted.length > 0) {
        updateAppData(selectedCategory, extracted);
        setStatusMsg('System Synchronized!');
        setManualText('');
      } else {
        setStatusMsg('Parse failed.');
      }
    } catch (err) {
      setStatusMsg('Logic Error.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusMsg(''); }, 2000);
    }
  };

  const updateAppData = (category: AdminCategory, items: any[]) => {
    setAppData(prev => {
      const newData = { ...prev };
      const key = CATEGORY_MAP[category].dataKey;
      if (category === 'TIMETABLE') {
        items.forEach((entry: TimetableEntry) => {
          const idx = newData.timetable.findIndex(t => t.day === entry.day && t.branch === entry.branch && t.year === entry.year && t.division === entry.division);
          if (idx !== -1) newData.timetable[idx].slots = [...newData.timetable[idx].slots, ...entry.slots];
          else newData.timetable.push(entry);
        });
      } else {
        (newData[key] as any) = [...(newData[key] as any), ...items];
      }
      return newData;
    });
  };

  const deleteItem = (id: string) => {
    const key = CATEGORY_MAP[selectedCategory!].dataKey;
    setAppData(prev => ({ ...prev, [key]: (prev[key] as any[]).filter(i => i.id !== id) }));
  };

  const toggleComplaintStatus = (id: string) => {
    setAppData(prev => ({
      ...prev,
      complaints: prev.complaints.map(c => c.id === id ? { ...c, status: c.status === 'PENDING' ? 'RESOLVED' : 'PENDING' } : c)
    }));
  };

  const renderManagementView = (catKey: AdminCategory) => {
    const cat = CATEGORY_MAP[catKey];
    const items = (appData as any)[cat.dataKey] as any[];

    return (
      <div className="space-y-6 animate-slideUp">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedCategory(null)} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-blue-400 border border-slate-800 active:scale-90 transition-all">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div className="text-center">
            <h3 className="text-lg font-black text-white uppercase tracking-tighter">{cat.label} Hub</h3>
            <div className="flex items-center justify-center gap-1.5">
              <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
              <p className="text-[7px] text-slate-500 uppercase font-black tracking-widest">Global Live Connection</p>
            </div>
          </div>
          <div className="w-10"></div>
        </div>

        {catKey !== 'COMPLAINTS' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 border-2 border-slate-800 border-dashed rounded-[3rem] p-6 text-center group hover:border-blue-500/50 transition-all relative overflow-hidden">
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls, .txt, .pdf, image/*" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}
                  className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 active:scale-95 transition-all">
                  <i className="fa-solid fa-cloud-arrow-up text-2xl"></i>
                </button>
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Deploy Data</h4>
                <p className="text-[7px] text-slate-600 font-black mt-1 uppercase">Updates all users</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-6 text-center group transition-all">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 text-indigo-500 flex items-center justify-center mx-auto mb-4">
                  <i className="fa-solid fa-database text-2xl"></i>
                </div>
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Cloud Health</h4>
                <p className="text-[7px] text-emerald-500 font-black mt-1 uppercase">Optimal (Synced)</p>
              </div>
            </div>

            {catKey === 'CAMPUS_MAP' && (appData.campusMapImage || appData.stylizedMapImage) && (
              <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-4 animate-fadeIn space-y-4">
                 {appData.stylizedMapImage && (
                   <div>
                     <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-2 px-2">Global Campus Visual</p>
                     <img src={appData.stylizedMapImage} className="w-full h-40 object-cover rounded-xl border border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]" alt="Stylized" />
                   </div>
                 )}
                 <button onClick={() => setAppData(prev => ({...prev, campusMapImage: undefined, stylizedMapImage: undefined}))} className="w-full py-2 text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/10 rounded-lg">Reset Map Database</button>
              </div>
            )}
            
            {catKey !== 'CAMPUS_MAP' && (
              <div className="relative">
                <textarea rows={3} value={manualText} onChange={(e) => setManualText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 text-[11px] font-bold text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-800" 
                  placeholder={`Paste content to broadcast...`}
                />
                <button onClick={handleManualUpload} disabled={isProcessing || !manualText.trim()}
                  className="absolute bottom-4 right-4 bg-emerald-600 text-white w-10 h-10 rounded-xl shadow-lg flex items-center justify-center">
                  <i className="fa-solid fa-paper-plane"></i>
                </button>
              </div>
            )}
          </>
        )}

        {isProcessing && (
          <div className="flex items-center justify-center gap-3 py-2 bg-slate-900/50 rounded-full border border-slate-800 animate-pulse">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{statusMsg}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex justify-between items-center px-4">
            <h4 className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Global Record Store</h4>
            <span className="text-[8px] font-black text-slate-400 bg-slate-900 px-3 py-1 rounded-full">{items?.length || 0} Total</span>
          </div>
          <div className="space-y-3">
            {items?.map((item: any) => (
              <div key={item.id} className="bg-slate-900 p-5 rounded-[2.5rem] border border-slate-800 flex justify-between items-center group">
                <div className="flex-1 overflow-hidden pr-4">
                  {catKey === 'COMPLAINTS' ? (
                    <>
                      <p className="text-[10px] font-bold text-slate-300 leading-relaxed mb-2">{item.text}</p>
                      <span className={`text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${item.status === 'PENDING' ? 'text-amber-500 bg-amber-500/10' : 'text-emerald-500 bg-emerald-500/10'}`}>{item.status}</span>
                    </>
                  ) : (
                    <h5 className="text-[10px] font-black text-slate-200 truncate uppercase leading-none">{item.subject || item.name || item.title || item.day}</h5>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => deleteItem(item.id)} className="w-8 h-8 rounded-lg bg-slate-800 text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><i className="fa-solid fa-trash text-[10px]"></i></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto relative overflow-hidden font-['Outfit']">
      <header className="p-8 border-b border-slate-900 sticky top-0 bg-slate-950/80 backdrop-blur-xl z-20 flex justify-between items-center">
        <div className="flex items-center gap-4"><Logo className="w-12 h-12" /><h1 className="text-xl font-black tracking-tighter text-blue-500">ADMIN CONTROL</h1></div>
        <button onClick={onExit} className="bg-slate-900 w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
          <i className="fa-solid fa-power-off text-rose-500"></i>
        </button>
      </header>
      <main className="flex-1 p-6 overflow-y-auto pb-32 no-scrollbar">
        {selectedCategory ? renderManagementView(selectedCategory) : (
          <div className="space-y-10">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-10 rounded-[4rem] relative overflow-hidden group shadow-2xl">
              <div className="relative z-10">
                <p className="text-blue-200 text-[9px] font-black uppercase tracking-widest opacity-80 mb-2">Campus-Wide Sync Active</p>
                <h2 className="text-3xl font-black text-white leading-none tracking-tighter">Database<br/>Governance</h2>
              </div>
              <i className="fa-solid fa-server absolute -right-4 -bottom-4 text-[10rem] text-white/10 group-hover:scale-110 transition-transform duration-700"></i>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(CATEGORY_MAP) as AdminCategory[]).map(key => (
                <button key={key} onClick={() => setSelectedCategory(key)} className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] flex flex-col items-center justify-center group hover:border-blue-600 transition-all active:scale-95">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors"><i className={`fa-solid ${CATEGORY_MAP[key].icon} text-lg ${CATEGORY_MAP[key].color} group-hover:text-white`}></i></div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">{CATEGORY_MAP[key].label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
