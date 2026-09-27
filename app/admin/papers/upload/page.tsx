import { UploadForm } from './UploadForm'
import { requireAdmin } from '../../../../lib/guard'
import { PageHeader } from '../../../../components/Page'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  await requireAdmin()
  return (
    <>
      <PageHeader compact title="Upload a paper" lede="A JSON file and its images in one go. Nothing is saved unless every rule passes." />
      <p className="mt-2 text-ink-soft">
        It is checked before anything is saved, and saved as a draft even then. A paper only goes
        live after you schedule it on the next screen.
      </p>
      <UploadForm />
    </>
  )
}
