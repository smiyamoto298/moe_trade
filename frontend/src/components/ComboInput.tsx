interface Props {
  id: string
  value: string
  onChange: (val: string) => void
  options: string[]
  placeholder?: string
  className?: string
}

export default function ComboInput({ id, value, onChange, options, placeholder, className }: Props) {
  const listId = `${id}-list`
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  )
}
