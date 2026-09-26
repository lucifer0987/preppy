import { NextResponse } from 'next/server'
import { actionAdmin } from '../../../../lib/guard'
import { getPattern } from '../../../../lib/repo/settings'
import { buildTemplate, templateQuestionCount } from '../../../../lib/template'
import { patternTotals } from '../../../../lib/types'

export const dynamic = 'force-dynamic'

/**
 * A blank paper built to the pattern currently configured.
 *
 * format/template.json in the repo is the shipped default and stays that way.
 * Once the pattern has been changed, that file no longer matches, and the
 * alternative was editing DEFAULT_PATTERN and running a script -- which is not
 * something the rest of the setup ever asks of whoever runs this.
 */
export async function GET() {
  if (!(await actionAdmin())) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  const pattern = await getPattern()
  const template = buildTemplate(pattern)
  const n = templateQuestionCount(template)
  const { minutes } = patternTotals(pattern)

  return new NextResponse(JSON.stringify(template, null, 2) + '\n', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="paper-template-${n}q-${minutes}min.json"`,
      'cache-control': 'no-store',
    },
  })
}
