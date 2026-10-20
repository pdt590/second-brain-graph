import React, { useEffect, useRef, useState } from 'react';
import { Folder, X } from 'lucide-react';
import useModalFocus from './useModalFocus.js';

async function request(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

export default function WikiFolderDialog({ onClose, onSelected }) {
  const [current, setCurrent] = useState('');
  const [input, setInput] = useState('');
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const panel = useRef(null);
  const sequence = useRef(0);
  useModalFocus(panel, onClose, true, saving);

  const browse = async (path) => {
    const id = ++sequence.current;
    setLoading(true); setError('');
    try {
      const data = await request(`/api/wiki/browse?path=${encodeURIComponent(path || '')}`);
      if (id !== sequence.current) return;
      setListing(data); setInput(data.path);
    } catch (err) {
      if (id === sequence.current) setError(err.message);
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    request('/api/wiki/directory').then((data) => {
      if (cancelled) return;
      setCurrent(data.wikiDir); setInput(data.wikiDir);
      browse(data.wikiDir);
    }).catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; sequence.current += 1; };
  }, []);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const data = await request('/api/wiki/directory', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: input })
      });
      onSelected(data.wikiDir);
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className="modal-backdrop">
      <section className="password-dialog wiki-folder-dialog" ref={panel} tabIndex={-1}
        role="dialog" aria-modal="true" aria-labelledby="wiki-folder-title" aria-busy={saving}>
        <div className="dialog-head">
          <div><strong id="wiki-folder-title">Choose Wiki Folder</strong>
            <span>Browse folders on the computer running this server.</span></div>
          <button className="icon-button" onClick={onClose} disabled={saving} aria-label="Close folder picker"><X size={18} /></button>
        </div>
        <p className="wiki-current-path">Current wiki: <strong>{current || 'Loading…'}</strong></p>
        <form className="wiki-path-form" onSubmit={(event) => { event.preventDefault(); browse(input); }}>
          <label htmlFor="wiki-folder-path">Folder path</label>
          <div><input id="wiki-folder-path" name="wiki-folder" spellCheck={false} value={input} onChange={(event) => setInput(event.target.value)} disabled={saving} autoComplete="off" />
            <button disabled={loading || saving || !input.trim()} type="submit">Browse</button></div>
        </form>
        <div className="wiki-folder-shortcuts">
          <button disabled={loading || saving} onClick={() => browse('~')}>Home</button>
          <button disabled={loading || saving || !listing || listing.parent === listing.path} onClick={() => browse(listing.parent)}>Up one level</button>
          {listing?.roots.map((root) => <button key={root} disabled={loading || saving} onClick={() => browse(root)}>{root}</button>)}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="wiki-folder-list" aria-label="Subfolders" aria-busy={loading}>
          {loading ? <p role="status">Loading folders…</p> : listing && <>
            <p className="wiki-browsing-path">{listing.path}</p>
            {listing.directories.length ? listing.directories.map((folder) => (
              <button key={folder.path} disabled={saving} onClick={() => browse(folder.path)}>
                <Folder size={17} /><span>{folder.name}</span>
              </button>
            )) : <p>No subfolders. You can select this folder.</p>}
          </>}
        </div>
        <div className="wiki-folder-actions">
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button className="wiki-folder-confirm" onClick={save} disabled={loading || saving || !input.trim()}>
            {saving ? 'Loading wiki…' : 'Use this folder'}
          </button>
        </div>
      </section>
    </div>
  );
}
