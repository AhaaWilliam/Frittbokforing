import { useFiscalYearContext } from '../../contexts/FiscalYearContext'

interface PageHeaderProps {
  title: string
  action?: React.ReactNode
}

export function PageHeader({ title, action }: PageHeaderProps) {
  const { isReadOnly } = useFiscalYearContext()

  return (
    <div className="flex items-center justify-between border-b px-8 py-5">
      <h1 className="font-serif text-xl font-normal">{title}</h1>
      {!isReadOnly && action}
    </div>
  )
}
