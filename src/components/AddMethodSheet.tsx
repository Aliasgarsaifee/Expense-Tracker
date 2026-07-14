import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type FormEvent } from 'react'
import { addPaymentMethod, listPaymentMethods, type PaymentMethod } from '../db'
import { groupChoices, groupEmoji } from '../lib/paymentMeta'
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
export function AddMethodSheet({ open, ...rest }: Props) {
  if (!open) return null
  return <SheetLoader {...rest} />
}

// Group chips come from live data (custom groups stay offered once created);
// wait out the millisecond first read so presetGroup resolves against the
// real choices exactly once, at SheetBody's mount.
function SheetLoader(props: Omit<Props, 'open'>) {
  const methods = useLiveQuery(() => listPaymentMethods({ includeArchived: true }))
  if (!methods) return null
  return <SheetBody choices={groupChoices(methods)} {...props} />
}

// Mounted fresh on every open: presetGroup lands in state each time it is
// shown, and a name typed on a cancelled visit never leaks into the next one.
function SheetBody({
  choices,
  presetGroup,
  onCreated,
  onClose,
}: Omit<Props, 'open'> & { choices: string[] }) {
  const initialChip =
    presetGroup && choices.includes(presetGroup)
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
              {choices.map((g) => (
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
