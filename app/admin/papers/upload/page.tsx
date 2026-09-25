import Link from 'next/link'
import { UploadForm } from './UploadForm'

export const dynamic = 'force-dynamic'

export default function UploadPage() {
  return (
    <>
      <Link href="/admin/papers" className="text-sm font-bold text-play-purple">&larr; Papers</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Upload a paper</h1>
      <p className="mt-2 text-ink-soft">
        It is checked before anything is saved, and saved as a draft even then. A paper only goes
        live after you schedule it on the next screen.
      </p>
      <UploadForm />
    </>
  )
}
