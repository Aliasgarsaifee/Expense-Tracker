import { useRef, useState, type FormEvent } from 'react'
import { addCategory, type Category } from '../db'

// A tap-palette of common spend emojis, so most new categories need no
// keyboard at all; a free-text field covers anything else.
const PALETTE = [
  '🏷️', '✈️', '🎬', '📚', '🐕', '💇', '🎁', '🏋️',
  '☕', '🍺', '💊', '🧴', '👶', '🔧', '📱', '🎮',
  '💐', '🚗', '⛽', '🎓',
]

interface Props {
  open: boolean
  onCreated: (category: Category) => void
  onClose: () => void
}

export function AddCategorySheet({ open, onCreated, onClose }: Props) {
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState(PALETTE[0])
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      const created = await addCategory({ label, emoji })
      setLabel('')
      setEmoji(PALETTE[0])
      onCreated(created)
      onClose()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add the category.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add category"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">New category</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Cancel
          </button>
        </header>
        <form className="method-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              placeholder="e.g. Travel, Gifts, Pets"
              maxLength={30}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          <div className="field">
            <span>Icon</span>
            <div className="emoji-field">
              <input
                type="text"
                className="emoji-input"
                aria-label="Category emoji"
                maxLength={4}
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
              />
              <div className="emoji-palette" role="group" aria-label="Suggested icons">
                {PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="emoji-swatch"
                    aria-pressed={e === emoji}
                    aria-label={`Use ${e}`}
                    onClick={() => setEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="btn-primary"
            type="submit"
            disabled={label.trim() === '' || emoji.trim() === '' || saving}
          >
            Add category
          </button>
        </form>
      </div>
    </div>
  )
}
