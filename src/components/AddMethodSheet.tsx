import { useRef, useState, type FormEvent } from 'react'
import { addPaymentMethod, PAYMENT_GROUPS, type PaymentMethod } from '../db'
import { groupEmoji } from '../lib/paymentMeta'
import { useKeyboardInset } from '../lib/useKeyboardInset'

const CUSTOM = '__custom__'

interface Props {
  open: boolean
  /** Pre-select this group's chip when opened from a group's "+ add". */
  presetGroup?: string
  onCreated: (method: PaymentMethod) => void
  onClose: () => void
}

// One sheet for "I got a new card / wallet". Reachable from the Add form's
// group picker and from Settings, so a new method never interrupts logging
// an expense for long.
export function AddMethodSheet({ open, presetGroup, onCreated, onClose }: Props) {
  if (!open) return null
  return (
    <SheetBody presetGroup={presetGroup} onCreated={onCreated} onClose={onClose} />
  )
}

// Mounted fresh on every open: presetGroup lands in state each time it is
// shown, and a name typed on a cancelled visit never leaks into the next one.
function SheetBody({ presetGroup, onCreated, onClose }: Omit<Props, 'open'>) {
  const initialChip =
    presetGroup && PAYMENT_GROUPS.includes(presetGroup as (typeof PAYMENT_GROUPS)[number])
      ? presetGroup
      : presetGroup
        ? CUSTOM
        : 'Credit card'
  const [groupChip, setGroupChip] = useState(initialChip)
  const [customGroup, setCustomGroup] = useState(
    initialChip === CUSTOM ? (presetGroup ?? '') : '',
  )
  const [label, setLabel] = useState('')
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  useKeyboardInset(sheetRef)

  const group = groupChip === CUSTOM ? customGroup : groupChip

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      const created = await addPaymentMethod({ label, group })
      onCreated(created)
      onClose()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add the method.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add payment method"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-head">
          <h2 className="display">New payment method</h2>
          <button className="btn-text" type="button" onClick={onClose}>
            Cancel
          </button>
        </header>
        <form className="method-form" onSubmit={handleSubmit}>
          <div className="field">
            <span>Type</span>
            <div className="chip-grid" role="group" aria-label="Payment type">
              {PAYMENT_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="chip"
                  aria-pressed={groupChip === g}
                  onClick={() => setGroupChip(g)}
                >
                  <span aria-hidden="true">{groupEmoji(g)}</span> {g}
                </button>
              ))}
              <button
                type="button"
                className="chip"
                aria-pressed={groupChip === CUSTOM}
                onClick={() => setGroupChip(CUSTOM)}
              >
                <span aria-hidden="true">👛</span> Custom…
              </button>
            </div>
          </div>

          {groupChip === CUSTOM && (
            <label className="field">
              <span>Group name</span>
              <input
                type="text"
                placeholder="e.g. Wallet, Netbanking"
                maxLength={30}
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Name</span>
            <input
              type="text"
              placeholder={
                groupChip === 'Cash'
                  ? 'e.g. Cash, Petty cash'
                  : groupChip === 'UPI'
                    ? 'e.g. GPay, Paytm UPI'
                    : 'e.g. HDFC Regalia'
              }
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          <button
            className="btn-primary"
            type="submit"
            disabled={label.trim() === '' || group.trim() === '' || saving}
          >
            Add method
          </button>
        </form>
      </div>
    </div>
  )
}
