import { Input, type InputProps } from "./input"

export type TimeInputProps = Omit<InputProps, "type" | "mono">

/**
 * `<Input type="time">`, named: a wall-clock time, "HH:MM". Kept as a thin
 * wrapper so a call site reads as what it asks for; Input owns the look.
 */
export function TimeInput(props: TimeInputProps) {
  return <Input {...props} type="time" />
}

export type DateInputProps = TimeInputProps

/**
 * `<Input type="date">`, named: a calendar date, "YYYY-MM-DD", for a date
 * that stands alone (a goal's deadline). A date and a posting time together
 * is DateTimePicker.
 */
export function DateInput(props: DateInputProps) {
  return <Input {...props} type="date" />
}
