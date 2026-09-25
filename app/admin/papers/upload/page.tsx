import Link from 'next/link'
import { UploadForm } from './UploadForm'
import { requireAdmin } from '../../../../lib/guard'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  await requireAdmin()
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
