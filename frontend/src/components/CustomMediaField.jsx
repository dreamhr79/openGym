// The editor's part of a custom exercise's photo, GIF or video, and its link (CustomExForm in
// sheets.jsx). The row follows #295's picture field (horusglez) — the thumb of the draft, a
// tinted Add/Change and a ghost Remove — and the link field is #246's (Vaibhav159).
//
// A picked file is turned into what the state keeps right here (lib/media-ingest.js: re-encoded
// or scrubbed, hashed, with a poster) and put into the local store as pending before the form is
// saved. That order is safe: an abandoned draft's files are unreferenced and the local clean-up
// takes them after an hour; the server marks an upload that nothing references yet and keeps it
// for its grace period, so the state push landing after the upload changes nothing.
//
// The file input accepts image/* and video/* and nothing more specific: iOS converts a HEIC
// photo to JPEG only when the page does not explicitly ask for HEIC, and every format is checked
// on its bytes anyway.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { mediaOf, fmtClip } from '../lib/media-refs.js'
import { mediaStore } from '../lib/media-store.js'
import { MOBILE } from '../lib/mobile.js'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { limitsFrom, fmtMB, MB } from '../lib/media-limits.js'
import { CustomThumb } from './CustomMedia.jsx'
import { Row, Button } from './ui.jsx'
import Icon from './Icon.jsx'

const toast = m => useUI.getState().toast(m)

// A write the local store refused for room — IndexedDB's quota (Firefox names it its own way), or
// a full phone under the file store. The file itself was fine; saying the browser cannot read it
// would send someone looking for a different file.
const noRoom = e => e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || /ENOSPC|no space left/i.test(String(e?.message || ''))

/** The sentence for a refused file (MediaError codes from lib/media-ingest.js), or for a device
 *  that had no room to keep it. */
export function mediaErrorText(e) {
  if (noRoom(e)) return t('There is no room left on this device for that file.')
  switch (e?.code) {
    case 'type': return t('That file type is not supported — use a photo, a GIF, or an MP4, MOV or WebM video.')
    case 'too-large': return t('That file is too large — up to {0} MB.', fmtMB(e.mb))
    case 'too-long': return t('That video is too long — up to {0} seconds.', e.sec)
    case 'photo-too-big': return t('That photo is too large to process on this device.')
    default: return t('This browser cannot read that file.')
  }
}

const KIND_ICON = { image: 'image', gif: 'play', video: 'play' }

/**
 * The picking half of a media field, shared by the custom-exercise editor and a workout's photos
 * and videos (WorkoutMedia.jsx) so both run the very same ingest and store path. pick(file)
 * turns a picked file into what the state keeps (lib/media-ingest.js: re-encoded or scrubbed,
 * hashed, with a poster), puts its files into the local store as pending, and resolves the
 * MediaRef — or null after it toasted why not. `note` is the dim line that says where the files
 * will live; `canAdd` is false where nothing could keep them (a server without media, or a
 * browser that cannot store them), `showAdd` false only where the button should not even show,
 * `storable` false where this browser cannot keep a file at all.
 */
export function useMediaPicker() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState(null)
  // Whether files picked here outlive the tab: false when IndexedDB is blocked and the store runs
  // in memory — then nothing is offered, since a saved exercise would point at nothing tomorrow.
  const [storable, setStorable] = useState(true)
  useEffect(() => {
    let alive = true
    mediaStore.ready().then(() => { if (alive) setStorable(mediaStore.persistent) }).catch(() => { if (alive) setStorable(false) })
    return () => { alive = false }
  }, [])
  // Signed in to a server that answered without a `media` block: it predates the feature or has
  // MEDIA_UPLOADS=0. Nothing would ever reach it. A config not known yet (an offline start) is
  // not that answer — a file picked then waits here and goes up once the server is reached. A
  // guest in the browser is on that same server, and what it picks would be owed and never sent
  // once it signs up; a phone in local mode has no server (a config left from an earlier pairing
  // says nothing about it).
  const serverLacks = (!!user || !MOBILE) && !!config && !config.media

  const pick = async file => {
    if (!file) return null
    setBusy(true)
    setWarning(null)
    try {
      // The ingest (decoders, canvas, the MP4 walk) only loads when someone picks a file.
      const { ingestMediaFile } = await import('../lib/media-ingest.js')
      const out = await ingestMediaFile(file, limitsFrom(config))
      for (const b of out.blobs) await mediaStore.put(b.hash, b.blob, { mime: b.mime, pending: true })
      // A guest's or a local phone's copy is the only one: ask the browser not to evict it under
      // storage pressure. Best effort, and absent on plain http.
      if (!user) { try { globalThis.navigator?.storage?.persist?.()?.catch?.(() => {}) } catch { /* not offered */ } }
      if (out.warnings.includes('codec')) setWarning(t('This video may not play on every device — MP4 (H.264) plays everywhere.'))
      return out.media
    } catch (e) {
      toast(mediaErrorText(e))
      return null
    } finally {
      setBusy(false)
    }
  }
  const note = !storable ? t('This browser cannot store photos or videos here.')
    : serverLacks ? t('Your server does not store photos and videos yet.')
      : !user ? t('Kept on this device only — Export with photos & videos keeps a copy.')
        : null
  return { pick, busy, warning, setWarning, note, storable, showAdd: !serverLacks, canAdd: !busy && storable && !serverLacks }
}

const EXERCISEDB_URL = 'https://oss.exercisedb.dev/api/v1/exercises'
const SEARCH_PAGE = 8

const words = value => String(value || '').toLowerCase().trim().split(/[^a-z0-9]+/).filter(Boolean)

// Rank only the rows returned by ExerciseDB's documented filters. This remains useful when a
// broad name search returns several variants, but no longer requires downloading the catalogue.
export function imageSearchScore(item, query) {
  const q = words(query)
  if (!q.length) return 0
  const name = String(item?.name || '').toLowerCase()
  const meta = [item?.name, ...(item?.equipments || []), ...(item?.targetMuscles || []), ...(item?.secondaryMuscles || []), ...(item?.bodyParts || [])].join(' ').toLowerCase()
  let score = 1
  for (const word of q) score += name.includes(word) ? 20 : meta.includes(word) ? 4 : 0
  const phrase = q.join(' ')
  if (name === phrase) score += 120
  else if (name.startsWith(phrase)) score += 80
  else if (name.includes(phrase)) score += 60
  return score
}

function exerciseDbFilter(query) {
  const q = String(query || '').trim()
  const lower = q.toLowerCase()
  const url = new URL(EXERCISEDB_URL)
  url.searchParams.set('limit', '25')
  // Equipment is a first-class documented filter. Keep the remaining words as the fuzzy name
  // filter so "shoulder smith" means shoulder exercises on a Smith machine.
  if (/\bsmith(?:\s+machine)?\b/.test(lower)) {
    url.searchParams.set('equipments', 'smith machine')
    const name = q.replace(/\bsmith(?:\s+machine)?\b/ig, ' ').replace(/\s+/g, ' ').trim()
    if (name) url.searchParams.set('name', name)
  } else {
    url.searchParams.set('name', q)
  }
  return url
}

async function searchExerciseDb(query) {
  const url = exerciseDbFilter(query)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('exercise-search')
  const json = await res.json()
  return Array.isArray(json?.data) ? json.data : []
}

const base64Blob = (data, type) => {
  const raw = atob(data)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new Blob([bytes], { type })
}

async function downloadExerciseDbMedia(item) {
  const urls = [
    item?.exerciseId ? `https://static.exercisedb.dev/media/${encodeURIComponent(item.exerciseId)}.gif` : null,
    item?.gifUrl
  ].map(x => String(x || '')).filter(Boolean)
  if (!urls.length) throw new Error('media-url')
  let lastError = null
  for (const url of [...new Set(urls)]) {
    const type = url.toLowerCase().includes('.gif') ? 'image/gif' : 'image/jpeg'
    try {
      if (MOBILE) {
        // Native Capacitor download bypasses WebView CORS. The file only lives in Cache until
        // normal OpenGym media ingest has copied and hashed it.
        const path = `exercisedb-${Date.now()}-${Math.random().toString(36).slice(2)}.gif`
        let savedPath = null
        try {
          const saved = await Filesystem.downloadFile({ url, path, directory: Directory.Cache })
          savedPath = saved.path || null
          const read = await Filesystem.readFile(savedPath ? { path: savedPath } : { path, directory: Directory.Cache })
          const blob = typeof read.data === 'string' ? base64Blob(read.data, type) : new Blob([read.data], { type })
          if (!blob.size) throw new Error('media-empty')
          return blob
        } finally {
          try { await Filesystem.deleteFile(savedPath ? { path: savedPath } : { path, directory: Directory.Cache }) } catch { /* best effort */ }
        }
      }
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) throw new Error('media-download')
      const blob = await res.blob()
      if (!blob.size) throw new Error('media-empty')
      return blob
    } catch (e) { lastError = e }
  }
  throw lastError || new Error('media-download')
}

function ExerciseImageSearch({ exerciseName, pick, busy, onUse, hasMedia = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(exerciseName || '')
  const [results, setResults] = useState([])
  const [page, setPage] = useState(0)
  const [searching, setSearching] = useState(false)
  const [using, setUsing] = useState(null)

  useEffect(() => { if (!open) setQuery(exerciseName || '') }, [exerciseName, open])

  const search = async () => {
    const q = String(query || exerciseName || '').trim()
    if (!q) { toast(t('Give the exercise a name first')); return }
    setSearching(true)
    try {
      // Use ExerciseDB V1's documented filters directly. One search is one API request; GIFs
      // are still downloaded only after the user taps a result.
      const rows = await searchExerciseDb(q)
      const found = rows.map(item => ({ item, score: imageSearchScore(item, q) }))
        .sort((a, b) => b.score - a.score || String(a.item.name).localeCompare(String(b.item.name)))
        .map(x => x.item)
      setResults(found)
      setPage(0)
      if (!found.length) toast(t('No exercise images found'))
    } catch {
      toast(t('Could not search exercise images right now'))
    } finally { setSearching(false) }
  }

  const use = async item => {
    setUsing(item.exerciseId || item.gifUrl)
    try {
      const blob = await downloadExerciseDbMedia(item)
      const type = blob.type || 'image/gif'
      const ext = type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : type.includes('png') ? 'png' : 'jpg'
      const file = new File([blob], `exercise-${item.exerciseId || Date.now()}.${ext}`, { type })
      const got = await pick(file)
      if (got) {
        onUse(got)
        setOpen(false)
        toast(t('Exercise image selected'))
      }
    } catch {
      toast(t('Could not save that exercise image'))
    } finally { setUsing(null) }
  }

  const shown = results.slice(page * SEARCH_PAGE, page * SEARCH_PAGE + SEARCH_PAGE)
  const pages = Math.ceil(results.length / SEARCH_PAGE)

  return <div className="cmf-websearch">
    <Button variant="ghost" size="sm" icon="search" disabled={busy} onClick={() => setOpen(v => !v)}>
      {t(hasMedia ? 'Change image' : 'Find image')}
    </Button>
    {open && <div className="cmf-search-panel">
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('Search exercise images')} onKeyDown={e => { if (e.key === 'Enter') search() }} />
        <Button size="sm" variant="tinted" disabled={searching} onClick={search}>{searching ? t('Searching…') : t('Search')}</Button>
      </div>
      {shown.length > 0 && <div className="cmf-search-grid">
        {shown.map(item => <button type="button" className="cmf-search-result" key={item.exerciseId || item.gifUrl}
          disabled={!!using} onClick={() => use(item)}>
          <img src={item.gifUrl} alt="" loading="lazy" />
          <span><strong>{item.name}</strong><small>{[...(item.equipments || []), ...(item.targetMuscles || [])].slice(0, 2).join(' · ')}</small></span>
          {using === (item.exerciseId || item.gifUrl) && <span className="cmf-search-using">{t('Saving…')}</span>}
        </button>)}
      </div>}
      {pages > 1 && <div className="cmf-search-pages">
        <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>{t('Previous')}</Button>
        <span className="small dim">{page + 1} / {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))}>{t('Next')}</Button>
      </div>}
      <div className="small dim cmf-note">{t('Results from ExerciseDB. Tap an image to use it for this exercise.')}</div>
    </div>}
  </div>
}

export default function CustomMediaField({ media, url, onChange, exerciseName = '' }) {
  const { pick, busy, warning, setWarning, note, showAdd, canAdd } = useMediaPicker()
  const fileRef = useRef(null)
  const m = mediaOf({ media })
  // The draft's files stay out of the local clean-up for as long as this form is open: its
  // one-hour grace would otherwise take a file picked in a form left open longer, and the saved
  // exercise would point at nothing.
  const mainHash = m?.hash, posterHash = m?.poster?.hash
  useEffect(() => {
    if (!mainHash) return undefined
    return mediaStore.hold([mainHash, posterHash])
  }, [mainHash, posterHash])

  const onFile = async ev => {
    const file = ev.target.files && ev.target.files[0]
    ev.target.value = ''   // picking the same file again still fires onChange
    const got = await pick(file)
    if (got) onChange({ media: got })
  }

  // "0:07 · 2.4 MB": the length of a clip or an animation, and the size of the file itself (the
  // unit through the packs' own "{0} MB", so it reads Mo, МБ, م.ب where it should, and the
  // number with the language's own decimal mark).
  const sizeLine = m ? [m.dur != null && m.kind !== 'image' ? fmtClip(m.dur) : null, t('{0} MB', fmtMB(Math.max(0.1, m.size / MB), { fixed: true }))].filter(Boolean).join(' · ') : null
  const subtitle = m
    ? <span className="cmf-sub"><Icon name={KIND_ICON[m.kind]} />{sizeLine}</span>
    : t('Optional — a picture makes it easier to spot in a list.')

  return <div className="cmf">
    <Row icon="image" iconTint="var(--blue)" title={t('Photo, GIF or video')} subtitle={subtitle}>
      <div className="cmf-act">
        {m && <span className="cmf-thumb"><CustomThumb ex={{ custom: true, media: m }} /></span>}
        {/* Hidden on a server that will never take a file; shown but off where this browser
            cannot keep one, with the note below saying why. */}
        {showAdd && <Button variant="tinted" size="sm" icon={busy ? undefined : 'image'} disabled={!canAdd} onClick={() => fileRef.current?.click()}>
          {busy ? t('Loading…') : m ? t('Change') : t('Add')}
        </Button>}
        {m && <Button variant="ghost" size="sm" icon="xmark" aria-label={t('Remove')} title={t('Remove')} disabled={busy} onClick={() => { setWarning(null); onChange({ media: null }) }} />}
      </div>
    </Row>
    <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onFile} />
    {showAdd && <ExerciseImageSearch exerciseName={exerciseName} pick={pick} busy={busy} hasMedia={!!m}
      onUse={got => onChange({ media: got })} />}
    {warning && <div className="small dim cmf-note">{warning}</div>}
    {note && <div className="small dim cmf-note">{note}</div>}
    <input className="input cmf-link" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
      dir={url ? 'ltr' : undefined} placeholder={t('Video or guide link (optional)')}
      value={url || ''} onChange={e => onChange({ url: e.target.value })} />
  </div>
}
