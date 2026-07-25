import React, { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Upload, Download, Trash2, Dices, ShieldCheck, Settings, X, Plus, Archive, ImageIcon } from 'lucide-react';
import { readImage, writeImage, stripImage, dataUrlToBlob } from '@/lib/exif-engine';
import { FIELDS, FIELD_GROUPS, FieldDef } from '@/lib/exif-fields';
import { randomizeAll } from '@/lib/randomize';
import { useToast } from '@/hooks/use-toast';

function formatForInput(kind: string, val: string) {
  if (!val) return '';
  if (kind === 'datetime') {
    const m = val.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
    const m2 = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}`;
  }
  return val;
}

function FieldControl({ field, value, onChange }: { field: FieldDef, value: string, onChange: (val: string) => void }) {
  const commonClasses = "w-full bg-[#121214] border border-[#27272a] rounded-md text-sm font-mono text-zinc-100 px-3 py-2.5 transition-all focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-700";

  const displayValue = formatForInput(field.kind, value);

  if (field.kind === 'select') {
    return (
      <select
        value={displayValue}
        onChange={e => onChange(e.target.value)}
        className={commonClasses + " appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%208l3%203%203-3%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_10px_center] pr-8"}
      >
        <option value="">-- Not Set --</option>
        {field.options?.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={field.kind === 'datetime' ? 'datetime-local' : field.kind === 'number' ? 'number' : 'text'}
      value={displayValue}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || 'Not set'}
      className={commonClasses}
      step={field.kind === 'number' ? 'any' : undefined}
    />
  );
}

interface ImageItem {
  id: string;
  file: File;
  dataUrl: string;
  values: Record<string, string>;
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function editedName(name: string) {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop() : undefined;
  const base = parts.join('.');
  return ext ? `${base}-edited.${ext}` : `${base}-edited`;
}

export default function Home() {
  const { toast } = useToast();
  const [items, setItems] = useState<ImageItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const active = useMemo(() => items.find(it => it.id === activeId) ?? null, [items, activeId]);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const jpegFiles = files.filter(f => f.type.match(/image\/jpe?g/));
    const rejectedCount = files.length - jpegFiles.length;
    if (rejectedCount > 0) {
      toast({
        title: rejectedCount === files.length ? 'Unsupported format' : 'Some files skipped',
        description: `${rejectedCount} file(s) were not JPEG and were skipped. Only JPEG images are supported for metadata editing.`,
        variant: 'destructive',
      });
    }
    if (jpegFiles.length === 0) return;

    const results = await Promise.all(jpegFiles.map(async (file) => {
      try {
        const raw = await readFileAsDataUrl(file);
        const parsed = readImage(raw);
        if (!parsed.supported) return null;
        const item: ImageItem = { id: makeId(), file, dataUrl: parsed.dataUrl, values: parsed.values };
        return item;
      } catch {
        return null;
      }
    }));

    const newItems = results.filter((r): r is ImageItem => r !== null);
    const failedCount = jpegFiles.length - newItems.length;
    if (failedCount > 0) {
      toast({ title: 'Some files failed', description: `${failedCount} file(s) could not be read as JPEG data.`, variant: 'destructive' });
    }
    if (newItems.length === 0) return;

    setItems(prev => [...prev, ...newItems]);
    setActiveId(prev => prev ?? newItems[0].id);
    setFlashKey(k => k + 1);
    if (newItems.length > 1) {
      toast({ title: `${newItems.length} images loaded`, description: 'Select any file on the left to view or edit its metadata.' });
    }
  };

  const updateActiveValue = (key: string, val: string) => {
    if (!activeId) return;
    setItems(prev => prev.map(it => it.id === activeId ? { ...it, values: { ...it.values, [key]: val } } : it));
  };

  const selectItem = (id: string) => {
    setActiveId(id);
    setFlashKey(k => k + 1);
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const next = prev.filter(it => it.id !== id);
      setActiveId(current => {
        if (current !== id) return current;
        return next.length > 0 ? next[0].id : null;
      });
      return next;
    });
  };

  const handleClearAll = () => {
    setItems([]);
    setActiveId(null);
  };

  const downloadItem = (item: ImageItem) => {
    const newUrl = writeImage(item.dataUrl, item.values);
    const blob = dataUrlToBlob(newUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = editedName(item.file.name);
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadActive = () => {
    if (!active) return;
    try {
      // Always go through writeImage: it merges the current form values into
      // the file's existing metadata, updating only the managed fields and
      // leaving everything else (and any field the user left blank on a file
      // that never had it) untouched. Full removal only ever happens via the
      // explicit "Strip All Metadata" action, never implicitly on download.
      downloadItem(active);
      toast({ title: 'Saved successfully', description: 'Your updated image has been downloaded.' });
    } catch (err) {
      // Previously this could throw silently (e.g. from a corrupted data
      // URL) with nothing catching it, making the button look completely
      // unresponsive. Now the user always gets told what happened.
      console.error('Download failed:', err);
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Something went wrong while saving the file. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadAll = async () => {
    if (items.length === 0) return;
    if (items.length === 1) {
      handleDownloadActive();
      return;
    }
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      for (const item of items) {
        const newUrl = writeImage(item.dataUrl, item.values);
        const blob = dataUrlToBlob(newUrl);
        let name = editedName(item.file.name);
        const count = usedNames.get(name) ?? 0;
        usedNames.set(name, count + 1);
        if (count > 0) {
          const parts = name.split('.');
          const ext = parts.length > 1 ? parts.pop() : undefined;
          name = ext ? `${parts.join('.')}-${count}.${ext}` : `${name}-${count}`;
        }
        zip.file(name, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metaclean-edited.zip';
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Saved successfully', description: `${items.length} images packed into a ZIP and downloaded.` });
    } catch (err) {
      console.error('Bulk download failed:', err);
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Something went wrong while building the ZIP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsZipping(false);
    }
  };

  const handleStripActive = () => {
    if (!active) return;
    const strippedUrl = stripImage(active.dataUrl);
    setItems(prev => prev.map(it => it.id === active.id ? { ...it, dataUrl: strippedUrl, values: {} } : it));
    setFlashKey(k => k + 1);
    toast({ title: 'Metadata Stripped', description: 'All EXIF and GPS data cleared from the file.' });
  };

  const handleStripAll = () => {
    if (items.length === 0) return;
    setItems(prev => prev.map(it => ({ ...it, dataUrl: stripImage(it.dataUrl), values: {} })));
    setFlashKey(k => k + 1);
    toast({ title: 'Metadata Stripped', description: `All EXIF and GPS data cleared from ${items.length} file(s).` });
  };

  const handleRandomizeActive = () => {
    if (!active) return;
    const random = randomizeAll();
    setItems(prev => prev.map(it => it.id === active.id ? { ...it, values: random } : it));
    setFlashKey(k => k + 1);
    toast({ title: 'Randomized', description: 'Generated a completely new set of plausible metadata.' });
  };

  const handleRandomizeAll = () => {
    if (items.length === 0) return;
    setItems(prev => prev.map(it => ({ ...it, values: randomizeAll() })));
    setFlashKey(k => k + 1);
    toast({ title: 'Randomized', description: `Generated new plausible metadata for ${items.length} file(s) individually.` });
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen w-full bg-[#09090b] flex flex-col items-center justify-center relative overflow-hidden font-sans text-zinc-100">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>
        <div className="relative z-10 max-w-2xl w-full px-6 flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center justify-center p-4 bg-[#121214] border border-[#27272a] rounded-2xl shadow-2xl">
            <Settings className="w-8 h-8 text-zinc-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-50">Photo Metadata Editor</h1>
          <p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-lg">
            View, edit, randomize, or strip EXIF and GPS data from JPEG images.
            <span className="text-zinc-300 font-medium block mt-1"> 100% private and local.</span>
          </p>

          <label
            className={`w-full max-w-lg aspect-[2/1] border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300
              ${isDragging ? 'border-zinc-400 bg-[#18181b] scale-[1.02]' : 'border-zinc-800 bg-[#121214] hover:border-zinc-600 hover:bg-[#18181b]'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFiles(e.dataTransfer.files);
              }
            }}
          >
            <input type="file" className="hidden" accept="image/jpeg, image/jpg" multiple onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
              e.target.value = '';
            }} />
            <Upload className={`w-10 h-10 transition-colors ${isDragging ? 'text-zinc-300' : 'text-zinc-600'}`} />
            <div className="text-zinc-400 font-medium text-sm md:text-base">
              <span className="text-zinc-200">Click to browse</span> or drag & drop
            </div>
            <p className="text-[11px] text-zinc-600 font-mono uppercase tracking-widest">JPEG format only · multiple files supported</p>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#09090b] text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-[340px] border-b md:border-b-0 md:border-r border-[#27272a] bg-[#09090b] flex flex-col z-20 shadow-2xl shrink-0 h-[60vh] md:h-screen">
        <div className="p-4 md:p-5 border-b border-[#27272a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
            <h1 className="text-[13px] font-semibold tracking-widest text-zinc-200 uppercase truncate">
              EXIF Inspector <span className="text-zinc-500 normal-case font-mono tracking-normal">({items.length})</span>
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <input
              ref={addMoreInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg, image/jpg"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button onClick={() => addMoreInputRef.current?.click()} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors" title="Add more files">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={handleClearAll} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors" title="Close all files">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* File list */}
        <div
          className={`overflow-y-auto shrink-0 border-b border-[#27272a] bg-[#0c0c0e] transition-colors ${isDragging ? 'bg-[#18181b]' : ''}`}
          style={{ maxHeight: '30vh' }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
          }}
        >
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <div
                key={item.id}
                onClick={() => selectItem(item.id)}
                className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer border-l-2 transition-colors ${
                  isActive ? 'bg-[#18181b] border-l-zinc-100' : 'border-l-transparent hover:bg-[#141416]'
                }`}
              >
                <div className="w-9 h-9 rounded-md border border-[#27272a] bg-[#09090b] overflow-hidden shrink-0 flex items-center justify-center">
                  <img src={item.dataUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] truncate ${isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`} title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-[10px] text-zinc-600 font-mono">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                  className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-950/30 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Active file preview */}
        {active && (
          <div className="p-4 md:p-5 border-b border-[#27272a] bg-[#0c0c0e] flex items-center gap-3 shrink-0">
            <div className="w-14 h-14 rounded-md border border-[#27272a] bg-[#09090b] overflow-hidden flex items-center justify-center relative shrink-0">
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.015)_25%,rgba(255,255,255,0.015)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.015)_75%,rgba(255,255,255,0.015)_100%)] bg-[length:8px_8px] pointer-events-none"></div>
              <img src={active.dataUrl} alt="Preview" className="w-full h-full object-contain p-1 relative z-10" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <p className="text-[13px] font-medium truncate text-zinc-200" title={active.file.name}>{active.file.name}</p>
              <p className="text-[11px] text-zinc-500 font-mono">{(active.file.size / 1024 / 1024).toFixed(2)} MB • JPEG</p>
            </div>
          </div>
        )}

        {/* Per-file actions */}
        <div className="p-4 md:p-5 flex flex-col gap-2.5 shrink-0 bg-[#09090b]">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Selected file</p>
          <button onClick={handleDownloadActive} disabled={!active} className="flex items-center justify-center gap-2 w-full bg-zinc-100 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-medium py-2.5 px-4 rounded-md transition-colors text-[13px] shadow-sm">
            <Download className="w-4 h-4" /> Apply & Download
          </button>
          <div className="flex gap-2.5">
            <button onClick={handleRandomizeActive} disabled={!active} className="flex items-center justify-center gap-2 flex-1 bg-[#121214] hover:bg-[#18181b] disabled:opacity-40 disabled:cursor-not-allowed border border-[#27272a] text-zinc-200 py-2.5 px-4 rounded-md transition-colors text-[13px]">
              <Dices className="w-4 h-4" /> Randomize
            </button>
            <button onClick={handleStripActive} disabled={!active} className="flex items-center justify-center gap-2 flex-1 bg-transparent hover:bg-red-950/20 disabled:opacity-40 disabled:cursor-not-allowed text-red-400 hover:text-red-300 border border-transparent hover:border-red-900/40 py-2.5 px-4 rounded-md transition-colors text-[13px]">
              <Trash2 className="w-4 h-4" /> Strip
            </button>
          </div>
        </div>

        {/* Bulk actions */}
        <div className="px-4 md:px-5 pb-4 md:pb-5 flex flex-col gap-2.5 shrink-0 bg-[#09090b] border-t border-[#27272a] pt-4">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">All {items.length} files</p>
          <button onClick={handleDownloadAll} disabled={isZipping} className="flex items-center justify-center gap-2 w-full bg-[#121214] hover:bg-[#18181b] disabled:opacity-40 disabled:cursor-not-allowed border border-[#27272a] text-zinc-200 py-2.5 px-4 rounded-md transition-colors text-[13px]">
            <Archive className="w-4 h-4" /> {isZipping ? 'Zipping…' : items.length > 1 ? 'Download All (ZIP)' : 'Apply & Download'}
          </button>
          <div className="flex gap-2.5">
            <button onClick={handleRandomizeAll} className="flex items-center justify-center gap-2 flex-1 bg-[#121214] hover:bg-[#18181b] border border-[#27272a] text-zinc-200 py-2.5 px-4 rounded-md transition-colors text-[13px]">
              <Dices className="w-4 h-4" /> Randomize All
            </button>
            <button onClick={handleStripAll} className="flex items-center justify-center gap-2 flex-1 bg-transparent hover:bg-red-950/20 text-red-400 hover:text-red-300 border border-transparent hover:border-red-900/40 py-2.5 px-4 rounded-md transition-colors text-[13px]">
              <Trash2 className="w-4 h-4" /> Strip All
            </button>
          </div>
        </div>

        <div className="hidden md:block mt-auto p-5 bg-[#0c0c0e] border-t border-[#27272a]">
          <div className="flex items-start gap-3 text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600/80 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong className="text-zinc-300">100% Local.</strong> These files never leave your device. All editing happens directly in your browser.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Form */}
      <div className="flex-1 overflow-y-auto relative scroll-smooth bg-[#09090b] z-10 pb-20">
        {active ? (
          <div className="max-w-3xl mx-auto px-6 py-8 md:px-12 md:py-16">
            <div key={flashKey}>
              {FIELD_GROUPS.map((group, groupIdx) => {
                const groupFields = FIELDS.filter(f => f.group === group);
                if (groupFields.length === 0) return null;

                return (
                  <div key={group} className="mb-14 fade-in-stagger" style={{ animationDelay: `${groupIdx * 50}ms` }}>
                    <div className="mb-6 border-b border-[#27272a] pb-3">
                      <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight">{group}</h2>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                      {groupFields.map((field, fieldIdx) => (
                        <div key={field.key} className="flex flex-col gap-2.5 fade-in-stagger" style={{ animationDelay: `${groupIdx * 50 + fieldIdx * 20}ms` }}>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {field.label}
                          </label>
                          <FieldControl
                            field={field}
                            value={active.values[field.key] || ''}
                            onChange={(val) => updateActiveValue(field.key, val)}
                          />
                          {field.helper && (
                            <p className="text-[10px] text-zinc-600 leading-snug">
                              {field.helper}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-center px-6">
            <ImageIcon className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">Select a file on the left to view its metadata.</p>
          </div>
        )}
      </div>
    </div>
  );
}
