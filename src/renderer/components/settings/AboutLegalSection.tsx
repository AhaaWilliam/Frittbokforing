import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ExternalLink, Mail, FileText, X } from 'lucide-react'

const SUPPORT_EMAIL = 'william.gebriel@gmail.com'

const TOS_DRAFT = `VILLKOR FÖR ANVÄNDNING AV FRITT BOKFÖRING (utkast — ska granskas juridiskt)

1. Om appen
Fritt Bokföring är ett lokalt desktop-program för bokföring av svenska
aktiebolag. All data lagras i en SQLite-databas på din egen dator. Ingen
data skickas till externa servrar utan ditt uttryckliga samtycke.

2. Ansvar för bokföringen
Du är juridiskt ansvarig för din bokföring enligt Bokföringslagen (1999:1078).
Fritt Bokföring är ett verktyg — det befriar dig inte från ansvar för
korrekthet, arkivering eller deklarationer till Skatteverket.

3. Garantier
Appen levereras "som den är" (as-is). Utvecklaren lämnar inga uttryckliga
eller underförstådda garantier om lämplighet för ett visst ändamål. Du
bekräftar att du verifierar resultat mot officiella källor (Skatteverket,
Bokföringsnämnden) innan du lämnar in deklarationer.

4. Ansvarsbegränsning
Utvecklaren ansvarar inte för förluster, direkt eller indirekt, som
uppstår till följd av bugg, datafel, förlorad data eller felaktig
bokföring — utom vid uppsåt eller grov vårdslöshet.

5. Arkivering
Enligt Bokföringslagen 7 kap. är du skyldig att bevara räkenskapsinformation
i minst 7 år. Fritt Bokföring underlättar detta men ansvarar inte för
dataförlust. Ta regelbundna säkerhetskopior.

6. Ändringar
Dessa villkor kan komma att uppdateras. Senaste versionen visas alltid
här i appen.
`

const PRIVACY_DRAFT = `INTEGRITETSPOLICY FÖR FRITT BOKFÖRING (utkast — ska granskas juridiskt)

1. Dataansvarig
Fritt Bokföring samlar inte in, lagrar eller överför dina
bokföringsuppgifter till någon tredje part. Din databas är helt lokal.

2. Uppgifter som behandlas lokalt
- Organisationsnummer, företagsnamn, adressuppgifter (du matar in)
- Kund- och leverantörsuppgifter (du matar in)
- Bokföringstransaktioner, fakturor, kostnader
- Bankkontoimport-data från ISO 20022 camt.053-filer (om du importerar)

Alla ovanstående lagras uteslutande i databasen
~/Documents/Fritt Bokföring/ (eller motsvarande platform-sökväg).

3. Uppgifter som kan skickas ut
- PDF-fakturor som du genererar: lagras lokalt, skickas bara ut om du
  själv mejlar/delar dem
- Säkerhetskopior: du väljer själv plats
- SIE4/SIE5/Excel-exporter: du väljer själv plats

Appen gör inga automatiska nätverksanrop med dina data.

4. Loggar
Fel- och diagnostikloggar skrivs lokalt till operativsystemets log-mapp
(via electron-log). Dessa kan innehålla stacktraces — inga beloppsdata
eller kunddata loggas avsiktligt. Om du skickar loggar till support,
granska dem först.

5. Dina rättigheter (GDPR)
Eftersom appen inte samlar in eller behandlar dina personuppgifter i
centraliserad form kan utvecklaren inte radera eller exportera dem åt
dig — du har full kontroll via datafilen.

6. Kontakt
Frågor om denna policy: ${SUPPORT_EMAIL}
`

function LegalDialog({
  open,
  onOpenChange,
  title,
  body,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  body: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-elevated)] p-6 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Stäng"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {title} för Fritt Bokföring
          </Dialog.Description>
          <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed">
            {body}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Denna text är ett utkast och måste granskas juridiskt innan
            kommersiellt släpp. Fritt Bokföring är en lokal desktop-app utan
            serverkomponent — all bokföringsdata stannar på din dator.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function AboutLegalSection() {
  const [modalOpen, setModalOpen] = useState<'tos' | 'privacy' | null>(null)

  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

  const handleSupportMail = () => {
    const subject = encodeURIComponent(
      `Fritt Bokföring ${version} — supportärende`,
    )
    const body = encodeURIComponent(
      `\n\n---\nApp-version: ${version}\nPlattform: ${navigator.userAgent}`,
    )
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <div className="mb-8" data-testid="about-legal-section">
      <h2 className="mb-4 text-base font-medium">Om & juridik</h2>

      <dl className="mb-4 space-y-2">
        <div className="grid grid-cols-3 gap-2 border-b px-1 py-2.5">
          <dt className="text-sm text-muted-foreground">App-version</dt>
          <dd className="col-span-2 text-sm font-mono">{version}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModalOpen('tos')}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          data-testid="open-tos"
        >
          <FileText className="h-4 w-4" />
          Användarvillkor
        </button>
        <button
          type="button"
          onClick={() => setModalOpen('privacy')}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          data-testid="open-privacy"
        >
          <FileText className="h-4 w-4" />
          Integritetspolicy
        </button>
        <button
          type="button"
          onClick={handleSupportMail}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          data-testid="open-support-mail"
        >
          <Mail className="h-4 w-4" />
          Kontakta support
        </button>
        <a
          href="https://www.bokforingsnamnden.se/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ExternalLink className="h-4 w-4" />
          Bokföringsnämnden
        </a>
      </div>

      <LegalDialog
        open={modalOpen === 'tos'}
        onOpenChange={(o) => !o && setModalOpen(null)}
        title="Användarvillkor"
        body={TOS_DRAFT}
      />
      <LegalDialog
        open={modalOpen === 'privacy'}
        onOpenChange={(o) => !o && setModalOpen(null)}
        title="Integritetspolicy"
        body={PRIVACY_DRAFT}
      />
    </div>
  )
}
