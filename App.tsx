
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { StagingStyle, StagedImage, Project, RoomItem, Folder } from './types';
import { STAGING_STYLES } from './constants';
import { stageRoom } from './services/geminiService';
import JSZip from 'jszip';

const App: React.FC = () => {
  // Persistence state
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('stageai_projects_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load projects from localStorage", e);
      return [];
    }
  });

  const [lastSaved, setLastSaved] = useState<number>(Date.now());
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Active state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Fine-tuning state
  const [fineTuneImage, setFineTuneImage] = useState<string | null>(null);
  const [fineTuneHasMask, setFineTuneHasMask] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const fineTuneCanvasRef = useRef<HTMLCanvasElement>(null);

  // UI state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<string | null>(null);
  const [roomDeleteTarget, setRoomDeleteTarget] = useState<{folderId: string, roomId: string} | null>(null);

  const [newProjectData, setNewProjectData] = useState({ name: '', address: '', userName: '' });
  const [newFolderName, setNewFolderName] = useState('');
  const [currentView, setCurrentView] = useState<'original' | 'staged' | 'comparison'>('original');
  const [activeStyle, setActiveStyle] = useState<StagingStyle>(StagingStyle.MODERN);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [comparisonUrl, setComparisonUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [brushSize, setBrushSize] = useState(50);
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Persistence logic
  useEffect(() => {
    try {
      localStorage.setItem('stageai_projects_v1', JSON.stringify(projects));
      setLastSaved(Date.now());
    } catch (e: any) {
      console.error("Persistence error:", e);
    }
  }, [projects]);

  const handleManualSave = () => {
    setIsSavingManual(true);
    try {
      localStorage.setItem('stageai_projects_v1', JSON.stringify(projects));
      setLastSaved(Date.now());
      setTimeout(() => setIsSavingManual(false), 1500);
    } catch (e) {
      console.error("Manual save failed", e);
      setIsSavingManual(false);
    }
  };

  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;
  const activeFolder = (activeProject && activeFolderId) ? activeProject.folders.find(f => f.id === activeFolderId) : null;
  const activeRoom = (activeFolder && activeRoomId) ? activeFolder.rooms.find(r => r.id === activeRoomId) : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) setShowUploadMenu(false);
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeRoom && activeRoom.styleLabel) {
      generateComparison(activeRoom.sourceImage, activeRoom.originalImage);
    } else {
      setComparisonUrl(null);
    }
  }, [activeRoom?.id, activeRoom?.originalImage]);

  // Handle fine-tune canvas sync
  useEffect(() => {
    if (fineTuneImage && fineTuneCanvasRef.current) {
      const img = new Image();
      img.onload = () => {
        if (fineTuneCanvasRef.current) {
          fineTuneCanvasRef.current.width = img.naturalWidth;
          fineTuneCanvasRef.current.height = img.naturalHeight;
          clearFineTuneDrawing();
        }
      };
      img.src = fineTuneImage;
    }
  }, [fineTuneImage]);

  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const generateComparison = async (original: string, staged: string) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imgBefore = new Image();
      const imgAfter = new Image();
      await Promise.all([
        new Promise((res, rej) => { imgBefore.onload = res; imgBefore.onerror = rej; imgBefore.src = original; }),
        new Promise((res, rej) => { imgAfter.onload = res; imgAfter.onerror = rej; imgAfter.src = staged; })
      ]);
      const labelHeight = 80;
      const padding = 20;
      const imgWidth = imgBefore.width;
      const imgHeight = imgBefore.height;
      canvas.width = (imgWidth * 2) + padding;
      canvas.height = imgHeight + labelHeight;
      ctx.fillStyle = '#0f172a'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff'; 
      ctx.font = `bold ${Math.max(24, imgHeight * 0.04)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BEFORE', imgWidth / 2, labelHeight / 2);
      ctx.fillText('AFTER', imgWidth + padding + (imgWidth / 2), labelHeight / 2);
      ctx.drawImage(imgBefore, 0, labelHeight, imgWidth, imgHeight);
      ctx.drawImage(imgAfter, imgWidth + padding, labelHeight, imgWidth, imgHeight);
      setComparisonUrl(canvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.error("Comparison generation failed:", e);
    }
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectData.name || !newProjectData.address || !newProjectData.userName) return;
    const newProject: Project = { id: Math.random().toString(36).substr(2, 9), ...newProjectData, createdAt: Date.now(), folders: [] };
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setActiveFolderId(null);
    setShowProjectModal(false);
    setNewProjectData({ name: '', address: '', userName: '' });
  };

  const handleDeleteProject = () => {
    if (!projectDeleteTarget) return;
    setProjects(prev => prev.filter(p => p.id !== projectDeleteTarget));
    if (activeProjectId === projectDeleteTarget) {
      setActiveProjectId(null);
      setActiveFolderId(null);
      setActiveRoomId(null);
    }
    setProjectDeleteTarget(null);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName || !activeProjectId) return;
    const newFolderId = Math.random().toString(36).substr(2, 9);
    const newFolder: Folder = { id: newFolderId, name: newFolderName, rooms: [] };
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return { ...p, folders: [...p.folders, newFolder] };
      }
      return p;
    }));
    setActiveFolderId(newFolderId);
    setExpandedFolderIds(prev => new Set(prev).add(newFolderId));
    setShowFolderModal(false);
    setNewFolderName('');
  };

  const confirmDeleteRoom = () => {
    if (!roomDeleteTarget || !activeProjectId) return;
    const { folderId, roomId } = roomDeleteTarget;
    
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          folders: p.folders.map(f => {
            if (f.id === folderId) {
              return { ...f, rooms: f.rooms.filter(r => r.id !== roomId) };
            }
            return f;
          })
        };
      }
      return p;
    }));
    
    if (activeRoomId === roomId) setActiveRoomId(null);
    setRoomDeleteTarget(null);
  };

  const triggerUpload = (mode: 'single' | 'batch') => {
    if (!activeFolderId) return alert("Select a folder first.");
    setUploadMode(mode);
    setShowUploadMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.multiple = mode === 'batch';
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && activeProjectId && activeFolderId) {
      const fileList = Array.from(files) as File[];
      const filePromises = fileList.map(file => {
        return new Promise<{id: string, base64: string}>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({ id: Math.random().toString(36).substr(2, 9), base64: e.target?.result as string });
          };
          reader.readAsDataURL(file);
        });
      });
      const results = await Promise.all(filePromises);
      
      const newRooms: RoomItem[] = results.map(item => ({ 
        id: item.id, 
        originalImage: item.base64, 
        sourceImage: item.base64, 
        stagedHistory: [] 
      }));

      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return { ...p, folders: p.folders.map(f => f.id === activeFolderId ? { ...f, rooms: [...newRooms, ...f.rooms] } : f) };
        }
        return p;
      }));
      
      if (newRooms.length === 1) {
        setActiveRoomId(newRooms[0].id);
        setCurrentView('original');
      }
    }
    if (event.target) event.target.value = '';
  };

  const handleStageRequest = async (style: StagingStyle) => {
    const sourceImg = fineTuneImage || (activeRoom ? activeRoom.originalImage : null);
    const rootSourceImg = activeRoom ? activeRoom.sourceImage : sourceImg;

    if (!sourceImg || !activeProjectId || !activeFolderId) return alert("Select or load an image to stage.");

    setIsProcessing(true);
    setError(null);
    setActiveStyle(style);

    let maskBase64: string | undefined;
    if (fineTuneHasMask && fineTuneCanvasRef.current) {
      maskBase64 = fineTuneCanvasRef.current.toDataURL('image/png');
    }

    try {
      const resultUrl = await stageRoom(sourceImg, style, customPrompt, maskBase64);
      
      const newRoom: RoomItem = {
        id: Math.random().toString(36).substr(2, 9),
        originalImage: resultUrl,
        sourceImage: rootSourceImg as string,
        styleLabel: style,
        stagedHistory: []
      };

      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            folders: p.folders.map(f => f.id === activeFolderId ? { ...f, rooms: [newRoom, ...f.rooms] } : f)
          };
        }
        return p;
      }));
      
      setActiveRoomId(newRoom.id);
      setCurrentView('staged');
      clearFineTuneDrawing();
      setFineTuneImage(null);
    } catch (err: any) {
      console.error("Staging error:", err);
      setError(err.message || "Failed to stage room.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchStage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeFolder || !activeProjectId || !activeFolderId) return;
    
    const targets = activeFolder.rooms.filter(r => !r.styleLabel);
    if (targets.length === 0) return alert("No unstaged original photos found in this folder.");

    if (!confirm(`Launch AI for ${targets.length} assets?`)) return;

    setIsProcessing(true);
    setError(null);
    setBatchProgress({ current: 0, total: targets.length });

    try {
      for (let i = 0; i < targets.length; i++) {
        setBatchProgress({ current: i + 1, total: targets.length });
        const target = targets[i];
        
        try {
          const resultUrl = await stageRoom(target.originalImage, activeStyle, customPrompt);
          
          const newRoom: RoomItem = {
            id: Math.random().toString(36).substr(2, 9),
            originalImage: resultUrl,
            sourceImage: target.sourceImage,
            styleLabel: activeStyle,
            stagedHistory: []
          };

          setProjects(prev => prev.map(p => {
            if (p.id === activeProjectId) {
              return {
                ...p,
                folders: p.folders.map(f => f.id === activeFolderId ? { ...f, rooms: [newRoom, ...f.rooms] } : f)
              };
            }
            return p;
          }));

          setActiveRoomId(newRoom.id);
          setCurrentView('staged');
        } catch (err) {
          console.warn(`Failed to stage asset ${target.id}`, err);
        }
      }
    } catch (err: any) {
      setError("The batch sequence encountered an issue.");
    } finally {
      setIsProcessing(false);
      setBatchProgress(null);
    }
  };

  const startFineTuneDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    drawFineTune(e);
  };

  const stopFineTuneDrawing = () => {
    setIsDrawing(false);
    if (fineTuneCanvasRef.current) {
      const ctx = fineTuneCanvasRef.current.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const drawFineTune = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !fineTuneCanvasRef.current || !fineTuneImage) return;
    const canvas = fineTuneCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineWidth = brushSize * (canvas.width / 1000); 
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)'; 

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    setFineTuneHasMask(true);
  };

  const clearFineTuneDrawing = () => {
    if (fineTuneCanvasRef.current) {
      const ctx = fineTuneCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, fineTuneCanvasRef.current.width, fineTuneCanvasRef.current.height);
    }
    setFineTuneHasMask(false);
  };

  const downloadImage = () => {
    let url = currentView === 'comparison' ? comparisonUrl : (currentView === 'original' ? activeRoom?.sourceImage : activeRoom?.originalImage);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentView}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const downloadProjectZip = async () => {
    if (!activeProject) return;
    setIsZipping(true);
    setShowExportMenu(false);
    try {
      const zip = new JSZip();
      const projectRoot = zip.folder(activeProject.name) || zip;
      activeProject.folders.forEach(folder => {
        const folderNode = projectRoot.folder(folder.name) || projectRoot;
        folder.rooms.forEach((room, roomIdx) => {
          const label = room.styleLabel ? `_${room.styleLabel}` : `_Original`;
          folderNode.file(`Room_${roomIdx + 1}${label}.jpg`, room.originalImage.split(',')[1], {base64: true});
        });
      });
      const blob = await zip.generateAsync({type: "blob"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${activeProject.name.replace(/\s+/g, '_')}_Staged.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ZIP Generation failed:", err);
      setError("Failed to create ZIP.");
    } finally {
      setIsZipping(false);
    }
  };

  if (!activeProjectId || !activeProject) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 sm:px-8">
           <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-2 rounded-lg shadow-md"><i className="fas fa-magic"></i></div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">StageAI</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto w-full p-6 sm:p-10 flex-grow">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Real Estate Projects</h2>
            <button onClick={() => setShowProjectModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-black shadow-lg transition-all flex items-center gap-2"><i className="fas fa-plus"></i> New Project</button>
          </div>
          {projects.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-20 text-center border border-slate-200 shadow-sm">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6"><i className="fas fa-city text-4xl text-blue-300"></i></div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Initialize your first workspace</h3>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">Upload property photos and transform spaces into stunning listings.</p>
              <button onClick={() => setShowProjectModal(true)} className="text-blue-600 font-black hover:text-blue-700 px-8 py-3 bg-blue-50 rounded-2xl">Create Project</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map(project => (
                <div key={project.id} onClick={() => setActiveProjectId(project.id)} className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm hover:shadow-2xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col h-full border-b-4 border-b-transparent hover:border-b-blue-600">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-4 bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 rounded-2xl transition-colors"><i className="fas fa-building text-2xl"></i></div>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setProjectDeleteTarget(project.id); }} className="text-slate-200 hover:text-red-500 p-2 transition-colors"><i className="fas fa-trash-alt text-sm"></i></button>
                    </div>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 group-hover:text-blue-600 mb-2">{project.name}</h3>
                  <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-6 line-clamp-2 font-medium"><i className="fas fa-map-marker-alt"></i> {project.address}</p>
                  <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Agent: {project.userName}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); handleManualSave(); }} className="p-2 text-slate-300 hover:text-emerald-600 transition-colors" title="Save Project Locally"><i className="fas fa-floppy-disk"></i></button>
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">{project.folders.reduce((acc, f) => acc + f.rooms.length, 0)} Assets</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Project Modal */}
        {showProjectModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <div className="bg-slate-900 w-full max-sm rounded-[2.5rem] p-10 shadow-2xl border border-slate-800">
              <h3 className="text-3xl font-black mb-8 text-white">Project Specs</h3>
              <form onSubmit={handleCreateProject} className="space-y-6">
                <input type="text" required placeholder="Project Title" className="w-full px-6 py-4 rounded-2xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 font-bold" value={newProjectData.name} onChange={e => setNewProjectData({...newProjectData, name: e.target.value})} />
                <input type="text" required placeholder="Full Address" className="w-full px-6 py-4 rounded-2xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 font-bold" value={newProjectData.address} onChange={e => setNewProjectData({...newProjectData, address: e.target.value})} />
                <input type="text" required placeholder="Agent / Owner" className="w-full px-6 py-4 rounded-2xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 font-bold" value={newProjectData.userName} onChange={e => setNewProjectData({...newProjectData, userName: e.target.value})} />
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setShowProjectModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[10px] tracking-widest">Abort</button>
                  <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-900/40">Initialize</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Project Confirmation Modal */}
        {projectDeleteTarget && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-[2rem] p-10 border border-slate-200 shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl"><i className="fas fa-trash-can"></i></div>
              <h3 className="text-xl font-black mb-2 text-slate-900">Delete Project?</h3>
              <p className="text-slate-500 text-sm mb-8">This action cannot be undone. All staged assets will be permanently removed.</p>
              <div className="flex gap-4">
                <button onClick={() => setProjectDeleteTarget(null)} className="flex-1 py-3 text-slate-500 font-black uppercase text-[10px] tracking-widest bg-slate-100 rounded-xl">Keep</button>
                <button onClick={handleDeleteProject} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-200">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
      
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { setActiveProjectId(null); setActiveFolderId(null); setActiveRoomId(null); setFineTuneImage(null); }} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-all"><i className="fas fa-arrow-left"></i></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 leading-none">{activeProject.name}</h1>
                <span className="text-[10px] text-slate-300 font-black px-2 py-0.5 rounded border border-slate-100 uppercase tracking-tighter hidden sm:block">{activeProject.address}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end mr-4 hidden md:flex">
               <span className="text-[9px] font-black uppercase text-slate-300 tracking-widest leading-none mb-1">Status</span>
               <span className="text-[10px] font-bold text-slate-400">Autosaved {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <button 
              onClick={handleManualSave} 
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all shadow-sm ${isSavingManual ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              {isSavingManual ? <i className="fas fa-check"></i> : <i className="fas fa-floppy-disk"></i>}
              <span className="uppercase tracking-widest text-[10px]">{isSavingManual ? 'Saved' : 'Save Project'}</span>
            </button>

            <div className="relative" ref={uploadMenuRef}>
              <button onClick={() => { if (activeFolderId) setShowUploadMenu(!showUploadMenu); else alert("Select a folder first."); }} disabled={!activeFolderId} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all shadow-sm ${activeFolderId ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-slate-300 bg-slate-50 cursor-not-allowed'}`}><i className="fas fa-cloud-upload"></i> New Asset <i className="fas fa-chevron-down text-[8px] ml-1"></i></button>
              {showUploadMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[60]">
                  <button onClick={() => triggerUpload('single')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"><div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center"><i className="fas fa-image"></i></div><div><div className="text-xs font-black text-slate-900">Upload Room</div><div className="text-[9px] text-slate-400 uppercase font-bold">Base Photo</div></div></button>
                  <button onClick={() => triggerUpload('batch')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"><div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center"><i className="fas fa-layer-group"></i></div><div><div className="text-xs font-black text-slate-900">Batch Upload</div><div className="text-[9px] text-slate-400 uppercase font-bold">Multiple Assets</div></div></button>
                </div>
              )}
            </div>
            {activeRoom && (
              <div className="relative" ref={exportMenuRef}>
                <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={isZipping} className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg flex items-center gap-2">
                  {isZipping ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-download"></i>}<span className="hidden sm:inline uppercase tracking-widest text-[10px]">Export</span>
                </button>
                {showExportMenu && (
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[60]">
                    <button onClick={downloadImage} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"><div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600"><i className="fas fa-file-image"></i></div><div><div className="text-xs font-black text-slate-900">View as JPG</div><div className="text-[9px] text-slate-400 uppercase font-bold">Current Frame</div></div></button>
                    <button onClick={downloadProjectZip} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left"><div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600"><i className="fas fa-file-zipper"></i></div><div><div className="text-xs font-black text-slate-900">Project ZIP</div><div className="text-[9px] text-slate-400 uppercase font-bold">All Asset Data</div></div></button>
                  </div>
                )}
              </div>
            )}
          </div>
      </header>

      <main className="flex-grow max-w-[1700px] mx-auto w-full px-6 py-8 flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm sticky top-24 h-fit max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-widest flex items-center gap-2"><i className="fas fa-layer-group text-blue-600"></i> Gallery</h3>
              <button onClick={() => setShowFolderModal(true)} className="text-blue-600 bg-blue-50 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-plus text-sm"></i></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-5 pr-2 custom-scrollbar">
              {activeProject.folders.map(folder => (
                <div key={folder.id} className="space-y-3">
                  <div onClick={() => { setActiveFolderId(folder.id); toggleFolderExpansion(folder.id); }} className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${activeFolderId === folder.id ? 'bg-slate-900 text-white shadow-xl' : 'hover:bg-slate-50 text-slate-400'}`}>
                    <div className="flex items-center gap-3">
                      <i className={`fas fa-chevron-right text-[8px] transition-transform ${expandedFolderIds.has(folder.id) ? 'rotate-90' : ''}`}></i>
                      <span className="text-[10px] font-black uppercase tracking-tight truncate max-w-[140px]">{folder.name}</span>
                    </div>
                  </div>
                  {expandedFolderIds.has(folder.id) && (
                    <div className="grid grid-cols-1 gap-2 pl-2">
                      {folder.rooms.map(room => (
                        <div key={room.id} className="group relative">
                          <button 
                            onClick={() => { setActiveRoomId(room.id); setCurrentView('original'); setFineTuneImage(null); }} 
                            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all border ${activeRoomId === room.id ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                          >
                            <img src={room.originalImage} className="w-12 h-12 rounded-lg object-cover bg-slate-100 flex-shrink-0" />
                            <div className="min-w-0 overflow-hidden text-left">
                              <div className={`text-[9px] font-black uppercase tracking-tight truncate ${activeRoomId === room.id ? 'text-blue-600' : 'text-slate-900'}`}>
                                {room.styleLabel || 'Original'}
                              </div>
                              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                Asset {room.id.substr(0, 4)}
                              </div>
                            </div>
                          </button>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all z-10">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setFineTuneImage(room.originalImage); }} 
                              className="bg-white/95 shadow-md p-2 rounded-lg text-blue-600 text-[10px] hover:bg-blue-600 hover:text-white transition-all"
                              title="Fine-tune this image"
                            >
                              <i className="fas fa-magic"></i>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setRoomDeleteTarget({folderId: folder.id, roomId: room.id}); }} 
                              className="bg-white/95 shadow-md p-2 rounded-lg text-red-500 text-[10px] hover:bg-red-500 hover:text-white transition-all"
                              title="Delete variation"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-grow flex flex-col gap-8">
          {/* Main Viewer - Full Stretch Edge to Edge */}
          <section className="flex-grow flex flex-col">
            <div className="relative group bg-slate-950 rounded-[3rem] overflow-hidden shadow-2xl h-[70vh] w-full flex items-center justify-center border-4 border-white">
              {activeRoom && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[50]">
                  <div className="flex bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-1.5 border border-white/20">
                    <button 
                      onClick={() => setCurrentView('original')} 
                      className={`px-8 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${currentView === 'original' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      Original
                    </button>
                    <button 
                      onClick={() => { if (activeRoom.styleLabel) setCurrentView('staged'); else alert("No staged variation yet."); }} 
                      className={`px-8 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${currentView === 'staged' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      Staged
                    </button>
                    <button 
                      onClick={() => { if (comparisonUrl) setCurrentView('comparison'); }} 
                      disabled={!comparisonUrl}
                      className={`px-8 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${currentView === 'comparison' ? 'bg-indigo-600 text-white shadow-xl' : (comparisonUrl ? 'text-slate-500 hover:text-slate-900' : 'text-slate-300 cursor-not-allowed')}`}
                    >
                      Compare
                    </button>
                  </div>
                </div>
              )}

              {activeRoom ? (
                <>
                  <div className={`w-full h-full relative transition-all ${isProcessing ? 'opacity-40 blur-sm scale-[0.98]' : 'opacity-100 scale-100'}`}>
                    <img 
                      src={currentView === 'comparison' && comparisonUrl ? comparisonUrl : (currentView === 'original' ? activeRoom.sourceImage : activeRoom.originalImage)} 
                      alt="Visualization" 
                      className="w-full h-full object-cover transition-all duration-700"
                    />
                  </div>
                  
                  {isProcessing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-xl z-[40] animate-in fade-in">
                      <div className="w-20 h-20 relative">
                        <div className="absolute inset-0 border-4 border-blue-600/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-t-blue-600 rounded-full animate-spin"></div>
                      </div>
                      <p className="mt-8 font-black text-white text-[10px] tracking-[0.4em] uppercase animate-pulse">
                        {batchProgress ? `Batch Staging: ${batchProgress.current}/${batchProgress.total}` : 'Processing Variation'}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-12 max-w-sm">
                  <div className="mb-8 inline-flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-slate-900 text-blue-500 shadow-2xl"><i className="fas fa-cube text-3xl"></i></div>
                  <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Virtual Workspace</h3>
                  <p className="text-slate-500 mb-8 font-bold text-[10px] uppercase tracking-widest">Select an asset from the gallery to begin staging</p>
                </div>
              )}
            </div>
          </section>

          {/* Dedicated Fine-Tuning Studio Workspace */}
          <section className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-inner flex flex-col gap-8 animate-in slide-in-from-bottom-6 duration-500">
            <div className="flex items-center justify-between border-b border-slate-100 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-xl shadow-sm"><i className="fas fa-magic"></i></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">Fine-Tuning Studio</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-1.5">Load any generated variation here for precise iterative staging</p>
                </div>
              </div>
              <div className="flex gap-3">
                {fineTuneImage && (
                  <>
                    <button onClick={clearFineTuneDrawing} className="text-[9px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest px-4 py-2 rounded-xl transition-all">Clear Mask</button>
                    <button onClick={() => { setFineTuneImage(null); clearFineTuneDrawing(); }} className="text-[9px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest px-4 py-2 rounded-xl transition-all">Reset Studio</button>
                  </>
                )}
                {!fineTuneImage && activeRoom && (
                  <button onClick={() => setFineTuneImage(activeRoom.originalImage)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Load Current Image</button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* Full Width Studio Workspace */}
              <div className="w-full bg-slate-950 rounded-[2.5rem] overflow-hidden min-h-[500px] h-[75vh] flex items-center justify-center relative border-4 border-white shadow-2xl">
                {fineTuneImage ? (
                  <div className="relative group cursor-crosshair w-full h-full">
                    <img src={fineTuneImage} alt="Fine tune source" className="w-full h-full object-cover block select-none" />
                    <canvas 
                      ref={fineTuneCanvasRef}
                      onMouseDown={startFineTuneDrawing}
                      onMouseMove={drawFineTune}
                      onMouseUp={stopFineTuneDrawing}
                      onMouseLeave={stopFineTuneDrawing}
                      onTouchStart={startFineTuneDrawing}
                      onTouchMove={drawFineTune}
                      onTouchEnd={stopFineTuneDrawing}
                      className="absolute inset-0 w-full h-full z-20 touch-none"
                    />
                  </div>
                ) : (
                  <div className="text-center p-10 flex flex-col items-center">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-200 text-2xl shadow-sm mb-4"><i className="fas fa-image"></i></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">No image in Workbench</p>
                    <div className="flex gap-2">
                       <button onClick={() => triggerUpload('single')} className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-5 py-2.5 rounded-xl hover:bg-indigo-100 transition-all">Upload Photo</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructional Info moved OUTSIDE the canvas on the bottom side */}
              {fineTuneImage && (
                <div className="flex justify-center -mt-2">
                  <div className="bg-slate-900/10 text-slate-500 px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-3 border border-slate-200 shadow-sm">
                    <i className="fas fa-info-circle text-blue-500"></i>
                    Draw directly on the image to mask specific changes
                  </div>
                </div>
              )}

              {/* Horizontal Control Bar below Canvas and Label */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-10 p-10 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-sm transition-all duration-300">
                <div className="flex-grow space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Adjust Precision Brush</label>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight mt-1">Control the size of the masking tool</span>
                    </div>
                    <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">{brushSize}px</span>
                  </div>
                  <div className="px-1">
                    <input 
                      type="range" min="5" max="250" value={brushSize} 
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 transition-all hover:bg-slate-300"
                    />
                  </div>
                </div>
                
                <div className="md:w-px md:h-16 bg-slate-200 hidden md:block"></div>

                <div className={`p-6 rounded-[2rem] border transition-all flex items-center gap-5 flex-shrink-0 md:min-w-[380px] ${fineTuneHasMask ? 'bg-emerald-50 border-emerald-100 text-emerald-700 shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${fineTuneHasMask ? 'bg-white' : 'bg-slate-50'}`}>
                    <i className={`fas ${fineTuneHasMask ? 'fa-check-circle text-emerald-500 animate-pulse' : 'fa-circle-notch text-slate-300'} text-xl`}></i>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black uppercase tracking-tight leading-none">
                      {fineTuneHasMask ? 'Custom Mask Active' : 'No Mask Detected'}
                    </span>
                    <span className="text-[9px] font-bold opacity-60 mt-1.5 uppercase tracking-tighter">
                      {fineTuneHasMask ? 'Staging will target highlighted area' : 'Staging will apply to entire scene'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Global Controls Panel */}
        <aside className="lg:w-80 flex-shrink-0">
          <div className="bg-slate-900 rounded-[3rem] p-8 border border-slate-800 shadow-2xl sticky top-24 h-fit">
            <h2 className="text-[10px] font-black text-white flex items-center gap-2 uppercase tracking-[0.2em] mb-8"><i className="fas fa-wand-magic-sparkles text-blue-500"></i> Generation engine</h2>
            
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar-dark">
                {STAGING_STYLES.map((style) => (
                  <button 
                    key={style.id}
                    onClick={() => setActiveStyle(style.id)} 
                    disabled={isProcessing} 
                    className={`flex flex-col items-center p-4 rounded-3xl border-2 transition-all group relative ${activeStyle === style.id ? 'border-blue-600 bg-blue-600/10 text-white' : 'border-slate-800 hover:border-slate-700 text-slate-500'}`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base mb-3 transition-colors ${activeStyle === style.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-600 group-hover:text-slate-400'}`}><i className={`fas ${style.icon}`}></i></div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-center">{style.label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-8 border-t border-slate-800 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">AI Context Prompt</label>
                  <textarea 
                    placeholder="Specific items to add..." 
                    className="w-full h-28 p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-medium text-white placeholder:text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none shadow-inner" 
                    value={customPrompt} 
                    onChange={(e) => setCustomPrompt(e.target.value)} 
                    disabled={isProcessing} 
                  />
                </div>
                
                <button 
                  onClick={() => handleStageRequest(activeStyle)} 
                  disabled={isProcessing} 
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.3em] shadow-2xl shadow-blue-900/40 transition-all flex flex-col items-center justify-center gap-1 group active:scale-95"
                >
                  {isProcessing && !batchProgress ? <i className="fas fa-circle-notch animate-spin text-lg"></i> : <i className="fas fa-bolt text-lg mb-1 group-hover:scale-125 transition-transform"></i>}
                  <span>{fineTuneHasMask ? 'Apply Studio Mask' : 'Launch Variation'}</span>
                </button>

                {activeFolder && activeFolder.rooms.length > 0 && (
                  <button 
                    onClick={(e) => handleBatchStage(e)} 
                    disabled={isProcessing} 
                    className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 py-4 rounded-[1.5rem] font-black text-[9px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 border border-slate-700"
                  >
                    <i className="fas fa-layer-group"></i>
                    <span>Batch Stage Folder</span>
                  </button>
                )}
                
                {error && (
                  <div className="bg-red-950/40 border border-red-900 text-red-400 p-4 rounded-2xl text-[9px] font-black uppercase tracking-tight animate-in shake">
                    <i className="fas fa-exclamation-triangle mr-2"></i> {error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Custom Room Delete Confirmation Modal */}
      {roomDeleteTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 border border-slate-200 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl shadow-inner">
              <i className="fas fa-trash-alt"></i>
            </div>
            <h3 className="text-xl font-black mb-3 text-slate-900">Delete Asset?</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">Do you want to permanently delete this image? This variation cannot be recovered once removed.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setRoomDeleteTarget(null)} 
                className="flex-1 py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all hover:bg-slate-200"
              >
                No
              </button>
              <button 
                onClick={confirmDeleteRoom} 
                className="flex-1 py-3.5 bg-red-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-200 transition-all hover:bg-red-600 active:scale-95"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {showFolderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-sm rounded-[2.5rem] p-10 border border-slate-800 shadow-2xl">
            <h3 className="text-2xl font-black mb-8 text-white tracking-tight">Gallery Folder</h3>
            <form onSubmit={handleCreateFolder} className="space-y-6">
              <input type="text" required placeholder="Name (e.g. Living Area)" className="w-full px-6 py-4 rounded-2xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-700 font-bold" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} />
              <div className="flex gap-4"><button type="button" onClick={() => setShowFolderModal(false)} className="flex-1 text-slate-500 text-[10px] font-black uppercase tracking-widest">Cancel</button><button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-900/40">Create</button></div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar-dark::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};

export default App;
