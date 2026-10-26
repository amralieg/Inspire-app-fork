import { useMemo, useState } from 'react';
import ImplementWizard from '../../src/pages/ImplementWizard';
import UseCaseStudio from '../../src/pages/UseCaseStudio';
import { makeApiFetch, makeApiPostJson } from '../../src/lib/apiClient';
import { caseIdOf } from '../../src/lib/implementWizard';
import { HARNESS_USE_CASE, HARNESS_SETTINGS, HARNESS_SESSION_ID } from './implementFixtures.js';

const AUTH = { token: 'tok', databricksHost: 'https://workspace.example.com' };

export default function HarnessApp({ open, nest }) {
  const content = <HarnessContent open={open} />;
  if (!nest) return content;
  return (
    <>
      <header data-harness-header="" className="sticky top-0 z-40 h-16 bg-surface border-b border-border">App header</header>
      <main className="page-enter">
        <div style={{ transform: 'translateZ(0)' }}>
          <div style={{ height: 2400 }}>A long results page</div>
          {content}
        </div>
      </main>
    </>
  );
}

function HarnessContent({ open }) {
  const apiFetch = useMemo(() => makeApiFetch(AUTH), []);
  const apiPostJson = useMemo(() => makeApiPostJson(AUTH), []);
  const [implementUc, setImplementUc] = useState(open === 'wizard' ? HARNESS_USE_CASE : null);
  const [focus, setFocus] = useState(null);
  const [studioId, setStudioId] = useState(open === 'studio' ? caseIdOf(HARNESS_USE_CASE) : null);
  return (
    <>
      {implementUc && (
        <ImplementWizard
          uc={implementUc}
          sessionId={HARNESS_SESSION_ID}
          settings={HARNESS_SETTINGS}
          discoveryType="Standard"
          apiFetch={apiFetch}
          apiPostJson={apiPostJson}
          focus={focus}
          onClose={() => { setImplementUc(null); setFocus(null); }}
          onImplemented={(data) => { setImplementUc(null); setFocus(null); setStudioId(data.use_case_id); }}
        />
      )}
      {studioId && (
        <UseCaseStudio
          sessionId={HARNESS_SESSION_ID}
          settings={HARNESS_SETTINGS}
          useCaseId={studioId}
          useCases={[HARNESS_USE_CASE]}
          apiFetch={apiFetch}
          apiPostJson={apiPostJson}
          onClose={() => setStudioId(null)}
          onEdit={(_id, nextFocus) => { setStudioId(null); setFocus(nextFocus || null); setImplementUc(HARNESS_USE_CASE); }}
          onOpenUseCase={setStudioId}
        />
      )}
    </>
  );
}
