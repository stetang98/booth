import { useEffect } from 'react';
import { CreateWizard } from './components/create/CreateWizard.tsx';
import { Home } from './components/home/Home.tsx';
import { Footer } from './components/layout/Footer.tsx';
import { Header } from './components/layout/Header.tsx';
import { PollPage } from './components/poll/PollPage.tsx';
import { useHashRoute } from './hooks/useHashRoute.ts';

function routeTitle(segments: string[]): string {
  if (segments[0] === 'poll' && segments[1] !== undefined) {
    return `Poll Nº ${segments[1]} — Booth`;
  }
  if (segments[0] === 'create') return 'Create a poll — Booth';
  return 'Booth — secret ballots, public math';
}

export default function App() {
  const { segments } = useHashRoute();

  useEffect(() => {
    document.title = routeTitle(segments);
  }, [segments]);

  let page = <Home />;
  if (segments[0] === 'poll' && segments[1] !== undefined) {
    const id = Number(segments[1]);
    page = Number.isInteger(id) && id >= 0 ? (
      <PollPage key={id} id={id} />
    ) : (
      <div className="wrap">
        <div className="notice notice--alarm" role="alert">
          “{segments[1]}” is not a poll number. <a href="#/">Back to the docket</a>
        </div>
      </div>
    );
  } else if (segments[0] === 'create') {
    page = <CreateWizard />;
  }

  return (
    <>
      <Header />
      <main>{page}</main>
      <Footer />
    </>
  );
}
