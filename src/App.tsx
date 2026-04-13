import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import type { Doc, Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

type ContestantDoc = Doc<"contestants">;

type ContestSummary = {
  _id: Id<"contests">;
  slug: string;
  season: number;
  name: string;
  shortName: string;
  description: string;
  heroBlurb: string;
  status: "draft" | "open" | "results" | "archived";
  contestType: "semi1" | "semi2" | "final" | "combined" | null;
  predictionCutoff: number | null;
};

type PredictComposerData = {
  contest: ContestSummary;
  contestants: ContestantDoc[];
  existingRanking: Id<"contestants">[] | null;
  viewer: {
    _id: Id<"users">;
    name: string;
    imageUrl: string | null;
  } | null;
};

type PredictionRowData = {
  contestantId: Id<"contestants">;
  predictedRank: number;
  actualPlacement: number | null;
  entryScore: number | null;
  country: string;
  countryCode: string;
  artist: string;
  song: string;
  imageUrl: string;
  youtubeUrl?: string;
};

type SFBonusRowData = {
  contestantId: Id<"contestants">;
  country: string;
  countryCode: string;
  artist: string;
  song: string;
  imageUrl: string;
  predictedSemiRank: number;
  actualSemiPlacement: number | null;
  bonusScore: number | null;
};

const SCORE_LABELS = [
  "Exact Match (Correct Rank): 12 Douze Points!",
  "Off by 1 Place: 10 Points",
  "Off by 2 Places: 8 Points",
  "Off by 3 to 9 Places: 7 down to 1 Point",
] as const;

const LOCAL_PREDICTION_PREFIX = "fantasyvision_prediction";

const CONTEST_TYPE_LABEL: Record<string, string> = {
  semi1: "Semi Final 1",
  semi2: "Semi Final 2",
  final: "Grand Final",
  combined: "Combined",
};

function setMetaTag(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function usePageMeta(title: string, opts?: { description?: string; imageUrl?: string }) {
  useEffect(() => {
    const fullTitle = title === "FantasyVision" ? title : `${title} · FantasyVision`;
    document.title = fullTitle;
    setMetaTag("og:title", fullTitle);
    const desc = opts?.description ?? "Drag, rank, and predict your Eurovision finishing order. Compete in leagues and see who really knows their douze points.";
    setMetaTag("og:description", desc);
    if (opts?.imageUrl) setMetaTag("og:image", opts.imageUrl);
    return () => {
      document.title = "FantasyVision";
    };
  });
}

export default function App() {
  return (
    <BrowserRouter>
      <ViewerBootstrap />
      <div className="app-shell">
        <SiteHeader />
        <main className="site-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/predict" element={<ContestSelectorPage />} />
            <Route path="/predict/:contestSlug" element={<PredictPage />} />
            <Route path="/my-picks" element={<MyPicksPage />} />
            <Route path="/leagues" element={<LeaguesPage />} />
            <Route path="/leagues/:leagueId" element={<LeagueDetailPage />} />
            <Route path="/share/:predictionId" element={<SharedPredictionPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <SiteFooter />
      </div>
    </BrowserRouter>
  );
}

function ViewerBootstrap() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const upsertViewer = useMutation(api.users.upsertViewer);
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      lastSyncedUserId.current = null;
      return;
    }

    if (isConvexAuthLoading || !isAuthenticated) {
      return;
    }

    if (lastSyncedUserId.current === user.id) {
      return;
    }

    lastSyncedUserId.current = user.id;
    void upsertViewer({}).catch(() => {
      lastSyncedUserId.current = null;
    });
  }, [isAuthenticated, isConvexAuthLoading, isLoaded, isSignedIn, upsertViewer, user]);

  return null;
}

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" to="/" onClick={closeMenu}>
          <span className="brand__mark" aria-hidden="true">
            ♪
          </span>
          <span className="brand__copy">
            <strong>FantasyVision</strong>
            <small>Predict. Compete. Share.</small>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="site-nav site-nav--desktop" aria-label="Primary">
          <NavItem to="/">Home</NavItem>
          <NavItem to="/predict">Predict</NavItem>
          <NavItem to="/my-picks">My Predictions</NavItem>
          <NavItem to="/leagues">My Leagues</NavItem>
        </nav>

        <div className="site-header__auth site-header__auth--desktop">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="button button--secondary">Log In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="button button--primary">Sign Up</button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <NavItem to="/profile">Profile</NavItem>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>

        {/* Hamburger — mobile only */}
        <button
          className={`hamburger${menuOpen ? " hamburger--open" : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`mobile-menu${menuOpen ? " mobile-menu--open" : ""}`} aria-hidden={!menuOpen}>
        <nav className="mobile-menu__nav" aria-label="Primary mobile">
          <NavItem to="/" onClick={closeMenu}>Home</NavItem>
          <NavItem to="/predict" onClick={closeMenu}>Predict</NavItem>
          <NavItem to="/my-picks" onClick={closeMenu}>My Predictions</NavItem>
          <NavItem to="/leagues" onClick={closeMenu}>My Leagues</NavItem>
        </nav>
        <div className="mobile-menu__auth">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="button button--secondary" onClick={closeMenu}>Log In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="button button--primary" onClick={closeMenu}>Sign Up</button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <NavItem to="/profile" onClick={closeMenu}>Profile</NavItem>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, children, onClick }: { to: string; children: string; onClick?: () => void }) {
  return (
    <NavLink
      className={({ isActive }) =>
        isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
      }
      to={to}
      onClick={onClick}
    >
      {children}
    </NavLink>
  );
}

function HomePage() {
  usePageMeta("FantasyVision");
  const home = useQuery(api.contests.getHomeData, {});
  const { isSignedIn } = useUser();

  if (home === undefined) {
    return <LoadingState label="Loading FantasyVision..." />;
  }

  if (!home.activeContests || home.activeContests.length === 0 || !home.stats) {
    return (
      <EmptyPanel
        title="No active contest yet"
        description="Seed the contest data first and FantasyVision will light up automatically."
      />
    );
  }

  // If there's a single active contest, show the traditional hero
  const primaryContest = home.activeContests[0];
  const isMultiContest = home.activeContests.length > 1;

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Welcome to FantasyVision!</p>
          <h1 className="hero__title">
            {isMultiContest ? `Eurovision ${primaryContest.season}` : primaryContest.shortName}
          </h1>
          <p className="hero__subtitle">
            {isMultiContest
              ? "Multiple contests are live. Pick your challenge below."
              : (primaryContest.heroBlurb || primaryContest.description)}
          </p>
          <div className="hero__actions">
            {!isSignedIn ? (
              <Link className="button button--primary" to="/predict">
                Start Predicting →
              </Link>
            ) : (
              <Link className="button button--secondary" to="/my-picks">
                View My Picks
              </Link>
            )}
          </div>
        </div>

        <div className="hero__badge">
          <span className="hero__badge-icon">♫</span>
        </div>
      </section>

      {isMultiContest ? (
        <section className="panel">
          <PageHeading
            eyebrow="Active Contests"
            title="Choose your challenge"
            description="Multiple contests are open for predictions. Dive in to any — or all of them."
          />
          <div className="contest-card-grid">
            {home.activeContests.map((contest) => (
              <ContestCard key={contest._id} contest={contest} />
            ))}
          </div>
        </section>
      ) : (
        <section className="feature-grid">
          <InfoCard
            title="Predict & Rank"
            description="Drag and drop the contestants into your perfect finishing order."
          />
          <InfoCard
            title="Leagues with Friends"
            description="Create a league, join a public room, or use a private code and see who called it best."
          />
          <InfoCard
            title="Share Your Picks"
            description="Every saved board gets a share link so you can prove exactly how right you were."
          />
        </section>
      )}

      <section className="stats-strip">
        <StatCard label="Players" value={home.stats.users} />
        <StatCard label="Saved Picks" value={home.stats.predictions} />
        <StatCard label="Public Leagues" value={home.stats.publicLeagues} />
      </section>

      {!isMultiContest && (
        <section className="panel">
          <PageHeading
            eyebrow="Join the action"
            title={primaryContest.name}
            description={primaryContest.description}
          />
          <div className="home-columns">
            <div className="home-columns__main">
              <p className="body-copy">
                Create your dream ranking, save it to your account, and come back later to see how
                close you got when the real placements arrive.
              </p>
              <div className="pill-row">
                <span className="pill">{labelContestStatus(primaryContest.status)}</span>
                <span className="pill pill--soft">Season {primaryContest.season}</span>
              </div>
            </div>
            <div className="home-columns__side">
              <h3 className="subheading">Public Leagues</h3>
              <div className="mini-list">
                {home.spotlightLeagues.length === 0 ? (
                  <p className="muted-copy">No public leagues yet.</p>
                ) : (
                  home.spotlightLeagues.map((league) => (
                    <LeagueMiniCard
                      key={league._id}
                      href={`/leagues/${league._id}`}
                      title={league.name}
                      meta={`${league.memberCount} member${league.memberCount === 1 ? "" : "s"}`}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {home.archivedContests.length > 0 && (
        <section className="panel">
          <h2 className="section-title">Past Contests</h2>
          <div className="mini-list">
            {home.archivedContests.map((contest) => (
              <div className="mini-card" key={contest._id}>
                <strong>{contest.name}</strong>
                <span>{labelContestStatus(contest.status)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ContestCard({ contest }: { contest: ContestSummary }) {
  return (
    <article className="contest-card">
      <div className="contest-card__copy">
        {contest.contestType ? (
          <span className="pill pill--soft">{CONTEST_TYPE_LABEL[contest.contestType] ?? contest.contestType}</span>
        ) : null}
        <strong>{contest.shortName}</strong>
        <p>{contest.heroBlurb || contest.description}</p>
      </div>
      <Link className="button button--accent" to={`/predict/${contest.slug}`}>
        Predict Now
      </Link>
    </article>
  );
}

function ContestSelectorPage() {
  usePageMeta("Make Your Picks");
  const activeContests = useQuery(api.contests.getActiveContests, {});

  if (activeContests === undefined) {
    return <LoadingState label="Loading contests..." />;
  }

  if (!activeContests || activeContests.length === 0) {
    return (
      <EmptyPanel
        title="No active contests"
        description="No contests are currently open for predictions."
      />
    );
  }

  // Single active contest — redirect straight through
  if (activeContests.length === 1) {
    return <Navigate to={`/predict/${activeContests[0].slug}`} replace />;
  }

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow="Prediction Board"
          title="Choose a Contest"
          description="Multiple contests are open. Pick which one you'd like to predict."
        />
      </section>
      <section className="panel">
        <div className="contest-card-grid">
          {activeContests.map((contest) => (
            <ContestCard key={contest._id} contest={contest} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PredictPage() {
  const { contestSlug = "" } = useParams();
  const { isLoaded, isSignedIn } = useUser();
  const data = useQuery(
    api.contests.getPredictPageData,
    contestSlug ? { contestSlug } : "skip",
  );
  usePageMeta(data ? `Rank Your Favorites: ${data.contest.shortName}` : "Make Your Picks");

  if (data === undefined || !isLoaded) {
    return <LoadingState label="Preparing the ranking board..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="Contest not found"
        description="This contest doesn't exist or is no longer active."
        cta={
          <Link className="button button--accent" to="/predict">
            Back to Contests
          </Link>
        }
      />
    );
  }

  const isClosed = data.contest.status !== "open";
  const typeLabel = data.contest.contestType
    ? CONTEST_TYPE_LABEL[data.contest.contestType]
    : null;

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow={typeLabel ? `${typeLabel} Prediction Board` : "Prediction Board"}
          title={`Rank Your Favorites: ${data.contest.shortName}`}
          description={
            data.contest.contestType === "combined"
              ? "Rank all 35 entrants. Your top 25 become your Grand Final picks. You'll also earn bonus points for calling the semi-final rankings correctly."
              : "Drag and drop (or use the arrow buttons) to arrange the contestants in your predicted finishing order. Your top pick should be at rank 1."
          }
        />
        {isClosed ? (
          <p className="alert-banner alert-banner--warning">Predictions are now closed.</p>
        ) : (
          <p className="alert-banner">Predictions are open!</p>
        )}
      </section>

      {data.contest.contestType === "combined" ? (
        <CombinedPredictComposer data={data} isSignedIn={Boolean(isSignedIn)} />
      ) : (
        <PredictComposer data={data} isSignedIn={Boolean(isSignedIn)} />
      )}
    </div>
  );
}

function PredictComposer({
  data,
  isSignedIn,
}: {
  data: PredictComposerData;
  isSignedIn: boolean;
}) {
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const savePrediction = useMutation(api.predictions.saveViewerPrediction);
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<ContestantDoc[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<Id<"contestants"> | null>(null);

  useEffect(() => {
    setRanking(loadComposerRanking(data));
  }, [data]);

  useEffect(() => {
    if (ranking.length > 0) {
      writeLocalRanking(data.contest._id, ranking);
    }
  }, [data.contest._id, ranking]);

  const handleMove = (fromIndex: number, toIndex: number) => {
    setRanking((current) => moveItem(current, fromIndex, toIndex));
  };

  const handleReset = () => {
    const resetRanking = hydrateRanking(data.contestants, data.existingRanking);
    setRanking(resetRanking);
    writeLocalRanking(data.contest._id, resetRanking);
    setStatusMessage("Ranking reset.");
  };

  const handleShuffle = () => {
    setRanking((current) => [...current].sort(() => Math.random() - 0.5));
    setStatusMessage("Contestants shuffled.");
  };

  const save = async () => {
    if (!isSignedIn) {
      setStatusMessage("Log in or sign up to save this ranking to your account.");
      return;
    }

    if (isConvexAuthLoading || !isAuthenticated) {
      setStatusMessage("Finishing sign-in. Please wait a moment and try saving again.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const predictionId = await savePrediction({
        contestId: data.contest._id,
        ranking: ranking.map((contestant) => contestant._id),
      });
      clearLocalRanking(data.contest._id);
      void navigate(`/share/${predictionId}`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="predict-layout">
      <section className="panel panel--ranking">
        <div className="panel__toolbar">
          <h2 className="section-title">Ranking List</h2>
          <div className="toolbar-actions">
            <button className="button button--secondary" onClick={handleShuffle} type="button">
              Shuffle List
            </button>
            <button className="button button--secondary" onClick={handleReset} type="button">
              Reset Order
            </button>
          </div>
        </div>

        <div className="ranking-list" role="list">
          {ranking.map((contestant, index) => (
            <ContestantRankCard
              contestant={contestant}
              draggedId={draggedId}
              index={index}
              isFirst={index === 0}
              isLast={index === ranking.length - 1}
              key={contestant._id}
              moveDown={() => handleMove(index, index + 1)}
              moveUp={() => handleMove(index, index - 1)}
              onDragStart={() => setDraggedId(contestant._id)}
              onDropOn={(sourceId, targetId) => {
                const fromIndex = ranking.findIndex((entry) => entry._id === sourceId);
                const toIndex = ranking.findIndex((entry) => entry._id === targetId);
                if (fromIndex >= 0 && toIndex >= 0) {
                  handleMove(fromIndex, toIndex);
                }
                setDraggedId(null);
              }}
              onDragEnd={() => setDraggedId(null)}
            />
          ))}
        </div>
      </section>

      <aside className="panel panel--sidebar">
        <PageHeading
          eyebrow="Scoring"
          title="How are scores calculated?"
          description="Points are awarded based on how close your predicted rank is to the actual placement."
        />
        <ul className="score-list">
          {SCORE_LABELS.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div className="score-example">
          <strong>Example Time!</strong>
          <p>
            If you predict Sweden finishes 1st and they do finish 1st, that is 12 points. Predict
            Italy 3rd and they finish 5th, that is 8 points. Miss by 10 or more places and it is
            nul points for that one.
          </p>
        </div>

        <SignedOut>
          <AuthPrompt
            title="Save your ranking online"
            description="You can build your board before signing in, but account sign-in is required to save and share it."
          />
        </SignedOut>

        <div className="predict-save-bar">
          <button
            className="button button--primary button--full"
            disabled={ranking.length === 0 || isSaving || (isSignedIn && isConvexAuthLoading)}
            onClick={() => void save()}
            type="button"
          >
            {isSaving
              ? "Saving..."
              : isSignedIn
                ? isConvexAuthLoading
                  ? "Connecting Account..."
                  : "Save to Account"
                : "Save Rankings & Log In"}
          </button>
          {statusMessage ? <p className="inline-message">{statusMessage}</p> : null}
        </div>
      </aside>
    </div>
  );
}

function CombinedPredictComposer({
  data,
  isSignedIn,
}: {
  data: PredictComposerData;
  isSignedIn: boolean;
}) {
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const savePrediction = useMutation(api.predictions.saveViewerPrediction);
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<ContestantDoc[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<Id<"contestants"> | null>(null);

  const autoQualifierIds = new Set(
    data.contestants.filter((c) => c.semiGroup === "auto").map((c) => c._id),
  );

  useEffect(() => {
    setRanking(loadComposerRanking(data));
  }, [data]);

  useEffect(() => {
    if (ranking.length > 0) {
      writeLocalRanking(data.contest._id, ranking);
    }
  }, [data.contest._id, ranking]);

  const handleMove = (fromIndex: number, toIndex: number) => {
    setRanking((current) => {
      const contestant = current[fromIndex];
      // Prevent auto-qualifiers from being moved to position 26+ (index >= 25)
      if (contestant && autoQualifierIds.has(contestant._id) && toIndex >= 25) {
        return current;
      }
      return moveItem(current, fromIndex, toIndex);
    });
  };

  const handleReset = () => {
    const resetRanking = hydrateRanking(data.contestants, data.existingRanking);
    setRanking(resetRanking);
    writeLocalRanking(data.contest._id, resetRanking);
    setStatusMessage("Ranking reset.");
  };

  const handleShuffle = () => {
    setRanking((current) => {
      // Keep auto-qualifiers in top 25 after shuffle
      const autoQualifiers = current.filter((c) => autoQualifierIds.has(c._id));
      const semis = current.filter((c) => !autoQualifierIds.has(c._id));
      const shuffledSemis = [...semis].sort(() => Math.random() - 0.5);
      // Place auto-qualifiers randomly in positions 1–25, semis fill the rest
      const top25Slots = shuffledSemis.slice(0, 25 - autoQualifiers.length);
      const bottom10Slots = shuffledSemis.slice(25 - autoQualifiers.length);
      const top25 = [...top25Slots, ...autoQualifiers].sort(() => Math.random() - 0.5);
      return [...top25, ...bottom10Slots];
    });
    setStatusMessage("Contestants shuffled.");
  };

  const save = async () => {
    if (!isSignedIn) {
      setStatusMessage("Log in or sign up to save this ranking to your account.");
      return;
    }

    if (isConvexAuthLoading || !isAuthenticated) {
      setStatusMessage("Finishing sign-in. Please wait a moment and try saving again.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const predictionId = await savePrediction({
        contestId: data.contest._id,
        ranking: ranking.map((c) => c._id),
      });
      clearLocalRanking(data.contest._id);
      void navigate(`/share/${predictionId}`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="predict-layout">
      <section className="panel panel--ranking">
        <div className="panel__toolbar">
          <h2 className="section-title">Ranking List</h2>
          <div className="toolbar-actions">
            <button className="button button--secondary" onClick={handleShuffle} type="button">
              Shuffle List
            </button>
            <button className="button button--secondary" onClick={handleReset} type="button">
              Reset Order
            </button>
          </div>
        </div>

        <div className="ranking-list" role="list">
          {ranking.map((contestant, index) => (
            <>
              {index === 25 && (
                <div className="combined-divider" key="divider">
                  <span>Grand Final picks above · Semi-only below</span>
                </div>
              )}
              <ContestantRankCard
                contestant={contestant}
                draggedId={draggedId}
                index={index}
                isFirst={index === 0}
                isLast={index === ranking.length - 1}
                key={contestant._id}
                moveDown={() => handleMove(index, index + 1)}
                moveUp={() => handleMove(index, index - 1)}
                onDragStart={() => setDraggedId(contestant._id)}
                onDropOn={(sourceId, targetId) => {
                  const fromIndex = ranking.findIndex((entry) => entry._id === sourceId);
                  const toIndex = ranking.findIndex((entry) => entry._id === targetId);
                  if (fromIndex >= 0 && toIndex >= 0) {
                    handleMove(fromIndex, toIndex);
                  }
                  setDraggedId(null);
                }}
                onDragEnd={() => setDraggedId(null)}
                semiGroupBadge={contestant.semiGroup ?? null}
                isAutoQualifier={autoQualifierIds.has(contestant._id)}
              />
            </>
          ))}
        </div>
      </section>

      <aside className="panel panel--sidebar">
        <PageHeading
          eyebrow="Combined Scoring"
          title="How does Combined work?"
          description="Rank all 35 entrants. Your scoring has two components."
        />
        <div className="score-example">
          <strong>Grand Final picks (top 25)</strong>
          <p>
            Positions 1–25 are your Grand Final predictions. If one of your picks doesn't qualify
            from their semi, the highest-ranked available pick from your bottom 10 takes their
            slot automatically.
          </p>
        </div>
        <div className="score-example">
          <strong>Semi-final bonus points</strong>
          <p>
            Any semi-finalist you place in your top 25 is also scored against the semi-final
            rankings. Exact semi rank = 10 bonus pts, off by 1 = 9 pts, and so on down to 1 pt.
          </p>
        </div>
        <div className="score-example">
          <strong>Auto-qualifiers (France, Germany, Italy, UK, Austria)</strong>
          <p>
            These countries skip the semis and go straight to the final. They must stay in
            your top 25 and earn no semi-final bonus.
          </p>
        </div>

        <SignedOut>
          <AuthPrompt
            title="Save your ranking online"
            description="Build your board first, then sign in to save and share it."
          />
        </SignedOut>

        <div className="predict-save-bar">
          <button
            className="button button--primary button--full"
            disabled={ranking.length === 0 || isSaving || (isSignedIn && isConvexAuthLoading)}
            onClick={() => void save()}
            type="button"
          >
            {isSaving
              ? "Saving..."
              : isSignedIn
                ? isConvexAuthLoading
                  ? "Connecting Account..."
                  : "Save to Account"
                : "Save Rankings & Log In"}
          </button>
          {statusMessage ? <p className="inline-message">{statusMessage}</p> : null}
        </div>
      </aside>
    </div>
  );
}

function MyPicksPage() {
  usePageMeta("My Predictions");
  const allPredictions = useQuery(api.predictions.getViewerAllActivePredictions, {});
  const hub = useQuery(api.leagues.getLeaguesHub, {});

  if (allPredictions === undefined) {
    return <LoadingState label="Loading your predictions..." />;
  }

  if (!allPredictions || allPredictions.length === 0) {
    return (
      <EmptyPanel
        title="No active contests yet"
        description="Seed contest data first so your saved picks have somewhere to appear."
      />
    );
  }

  const hasAnyLeague = hub && hub.viewerLeagues && hub.viewerLeagues.length > 0;

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow="My Predictions"
          title="Your Picks"
          description="Here's everything you've predicted across all active contests."
        />
      </section>

      {allPredictions.map(({ contest, prediction }) => (
        <section className="panel" key={contest._id}>
          <div className="section-header">
            <h2 className="section-title">{contest.shortName}</h2>
            {contest.contestType ? (
              <span className="pill pill--soft">
                {CONTEST_TYPE_LABEL[contest.contestType] ?? contest.contestType}
              </span>
            ) : null}
          </div>

          {!prediction ? (
            <div className="empty-section">
              <p className="muted-copy">No prediction saved yet.</p>
              <Link className="button button--accent" to={`/predict/${contest.slug}`}>
                Make Your Prediction
              </Link>
            </div>
          ) : prediction.isCombined ? (
            <>
              <CombinedScoreBanner prediction={prediction} predictionId={prediction._id} />
              <CombinedPredictionDisplay prediction={prediction} />
            </>
          ) : (
            <>
              <div className="score-banner">
                <div>
                  <strong>
                    {prediction.totalScore === null
                      ? "Awaiting results"
                      : `${prediction.totalScore} points`}
                  </strong>
                  <span>
                    {prediction.totalScore === null
                      ? "Scores appear once official placements are available."
                      : `Maximum possible score: ${prediction.maxPossibleScore}`}
                  </span>
                </div>
                <CopyShareButton predictionId={prediction._id} />
              </div>
              <PredictionTable rows={prediction.rows} />
            </>
          )}

          {prediction && !hasAnyLeague && (
            <div className="league-nudge">
              <p>Now see how you stack up — compete with your Eurovision crew in a league.</p>
              <Link className="button button--accent" to="/leagues">
                Join or Create a League →
              </Link>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

type CombinedPrediction = {
  _id: Id<"predictions">;
  totalScore: number | null;
  gfScore: number | null;
  sf1BonusTotal: number | null;
  sf2BonusTotal: number | null;
  gfRows: PredictionRowData[] | null;
  sf1BonusRows: SFBonusRowData[] | null;
  sf2BonusRows: SFBonusRowData[] | null;
  backfilledContestants: Id<"contestants">[];
};

function CombinedScoreBanner({
  prediction,
  predictionId,
}: {
  prediction: CombinedPrediction;
  predictionId: Id<"predictions">;
}) {
  const hasAnyScore = prediction.totalScore !== null;

  return (
    <div className="score-banner score-banner--combined">
      <div>
        <strong>
          {hasAnyScore ? `${prediction.totalScore} points total` : "Awaiting results"}
        </strong>
        {hasAnyScore && (
          <span className="score-breakdown">
            GF: {prediction.gfScore ?? 0} pts
            {" · "}SF1 bonus: {prediction.sf1BonusTotal ?? 0} pts
            {" · "}SF2 bonus: {prediction.sf2BonusTotal ?? 0} pts
          </span>
        )}
        {!hasAnyScore && (
          <span>Scores unlock as each semi-final result is published.</span>
        )}
      </div>
      <CopyShareButton predictionId={predictionId} />
    </div>
  );
}

function CombinedPredictionDisplay({ prediction }: { prediction: CombinedPrediction }) {
  const backfilledSet = new Set(prediction.backfilledContestants);

  return (
    <div className="combined-prediction">
      {prediction.gfRows && prediction.gfRows.length > 0 && (
        <div className="combined-section">
          <h3 className="subsection-title">Grand Final Picks (effective ranking)</h3>
          <PredictionTable
            rows={prediction.gfRows}
            backfilledIds={backfilledSet}
          />
        </div>
      )}

      {prediction.sf1BonusRows && prediction.sf1BonusRows.length > 0 && (
        <div className="combined-section">
          <h3 className="subsection-title">
            Semi Final 1 Bonus
            {prediction.sf1BonusTotal !== null
              ? ` — ${prediction.sf1BonusTotal} pts`
              : ""}
          </h3>
          <SFBonusTable rows={prediction.sf1BonusRows} />
        </div>
      )}

      {prediction.sf2BonusRows && prediction.sf2BonusRows.length > 0 && (
        <div className="combined-section">
          <h3 className="subsection-title">
            Semi Final 2 Bonus
            {prediction.sf2BonusTotal !== null
              ? ` — ${prediction.sf2BonusTotal} pts`
              : ""}
          </h3>
          <SFBonusTable rows={prediction.sf2BonusRows} />
        </div>
      )}

      {!prediction.gfRows && !prediction.sf1BonusRows && !prediction.sf2BonusRows && (
        <p className="muted-copy">
          Semi-final bonus points will appear here once the first semi is scored.
          Grand Final scores unlock after the final.
        </p>
      )}
    </div>
  );
}

function SFBonusTable({ rows }: { rows: SFBonusRowData[] }) {
  return (
    <div className="prediction-table">
      {rows.map((row) => (
        <article className="prediction-row" key={row.contestantId}>
          <img alt={`${row.country} flag`} className="prediction-row__image" src={`https://flagcdn.com/w80/${row.countryCode.toLowerCase()}.png`} />
          <div className="prediction-row__copy">
            <div className="prediction-row__headline">
              <span className="rank-chip">#{row.predictedSemiRank}</span>
              <strong>{row.country}</strong>
              <span>
                {flagFromCountryCode(row.countryCode)} {row.artist} - "{row.song}"
              </span>
            </div>
            <div className="prediction-row__meta">
              <span>
                {row.actualSemiPlacement === null
                  ? "Awaiting semi result"
                  : `Semi placement: ${row.actualSemiPlacement}`}
              </span>
              <span>{row.bonusScore === null ? "Not scored yet" : `+${row.bonusScore} bonus pts`}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function LeaguesPage() {
  usePageMeta("My Leagues");
  const [searchParams, setSearchParams] = useSearchParams();
  const contestIdParam = searchParams.get("contestId") as Id<"contests"> | null;

  const hub = useQuery(
    api.leagues.getLeaguesHub,
    contestIdParam ? { contestId: contestIdParam } : {},
  );
  const createLeague = useMutation(api.leagues.createLeague);
  const joinLeagueByCode = useMutation(api.leagues.joinLeagueByCode);
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (hub === undefined) {
    return <LoadingState label="Loading league rooms..." />;
  }

  if (!hub) {
    return (
      <EmptyPanel
        title="No active contest for leagues"
        description="Seed an active contest first so leagues have something to attach to."
      />
    );
  }

  const handleCreate = async () => {
    try {
      const leagueId = await createLeague({
        contestId: hub.contest._id,
        name: leagueName,
        visibility,
      });
      setLeagueName("");
      setMessage("League created.");
      void navigate(`/leagues/${leagueId}`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleJoin = async () => {
    try {
      const leagueId = await joinLeagueByCode({ joinCode });
      void navigate(`/leagues/${leagueId}`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow="My Leagues"
          title={`Play ${hub.contest.shortName} with friends`}
          description="Get your Eurovision crew together. Everyone saves their picks, you compete in a league, and the contest decides who really had the best ear."
        />

        {hub.activeContests && hub.activeContests.length > 1 && (
          <div className="contest-tabs">
            {hub.activeContests.map((c) => (
              <button
                className={
                  c._id === hub.contest._id
                    ? "contest-tab contest-tab--active"
                    : "contest-tab"
                }
                key={c._id}
                onClick={() => setSearchParams({ contestId: c._id })}
                type="button"
              >
                {c.contestType
                  ? (CONTEST_TYPE_LABEL[c.contestType] ?? c.shortName)
                  : c.shortName}
              </button>
            ))}
          </div>
        )}
      </section>

      <LeagueExplainer />

      <section className="league-grid">
        <div className="panel">
          <h2 className="section-title">Create a League</h2>
          <SignedOut>
            <AuthPrompt
              title="Sign in to create"
              description="League ownership is tied to your account so hosts can manage their rooms."
            />
          </SignedOut>
          <SignedIn>
            <label className="field">
              <span>League Name</span>
              <input
                onChange={(event) => setLeagueName(event.target.value)}
                placeholder="Northern Jury Favorites"
                value={leagueName}
              />
            </label>
            <div className="segmented">
              <button
                className={
                  visibility === "public"
                    ? "segmented__item segmented__item--active"
                    : "segmented__item"
                }
                onClick={() => setVisibility("public")}
                type="button"
              >
                Public
              </button>
              <button
                className={
                  visibility === "private"
                    ? "segmented__item segmented__item--active"
                    : "segmented__item"
                }
                onClick={() => setVisibility("private")}
                type="button"
              >
                Private
              </button>
            </div>
            <button
              className="button button--primary button--full"
              onClick={() => void handleCreate()}
              type="button"
            >
              Create League
            </button>
          </SignedIn>
        </div>

        <div className="panel">
          <h2 className="section-title">Join with a Code</h2>
          <label className="field">
            <span>Invite Code</span>
            <input
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="AB12CD34"
              value={joinCode}
            />
          </label>
          <button
            className="button button--secondary button--full"
            onClick={() => void handleJoin()}
            type="button"
          >
            Join League
          </button>
          {message ? <p className="inline-message">{message}</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Your Leagues</h2>
        <div className="mini-list">
          {hub.viewerLeagues.length === 0 ? (
            <p className="muted-copy">You have not joined any leagues for this contest yet.</p>
          ) : (
            hub.viewerLeagues.map((league) => (
              <LeagueMiniCard
                key={league._id}
                href={`/leagues/${league._id}`}
                title={league.name}
                meta={`${league.memberCount} member${league.memberCount === 1 ? "" : "s"}`}
              />
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Browse Public Leagues</h2>
        <div className="public-league-list">
          {hub.publicLeagues.map((league) => (
            <article className="league-card" key={league._id}>
              <div>
                <strong>{league.name}</strong>
                <p>
                  {league.memberCount} member{league.memberCount === 1 ? "" : "s"}
                </p>
              </div>
              <Link className="button button--secondary" to={`/leagues/${league._id}`}>
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function LeagueDetailPage() {
  const { isSignedIn } = useUser();
  const { leagueId = "" } = useParams();
  const data = useQuery(
    api.leagues.getLeagueDetail,
    leagueId ? { leagueId: leagueId as Id<"leagues"> } : "skip",
  );
  const joinLeague = useMutation(api.leagues.joinLeague);
  const leaveLeague = useMutation(api.leagues.leaveLeague);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const leagueName = data && "league" in data ? data.league.name : "League Room";
  usePageMeta(leagueName);

  if (data === undefined) {
    return <LoadingState label="Opening league room..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="League not found"
        description="This room may have been deleted, or the link is incorrect."
      />
    );
  }

  if (data.access !== "full") {
    return (
      <EmptyPanel
        title={`${data.league.name} is private`}
        description="Sign in and use the correct invite code from the host to unlock this room."
      />
    );
  }

  const fullData = data;

  const handleJoin = async () => {
    try {
      await joinLeague({
        leagueId: fullData.league._id,
        joinCode: fullData.league.visibility === "private" ? joinCode : undefined,
      });
      setMessage("Joined league.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleLeave = async () => {
    try {
      await leaveLeague({ leagueId: fullData.league._id });
      setMessage("Left league.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const isCombinedContest =
    "contestType" in (fullData.contest ?? {}) &&
    (fullData.contest as { contestType?: string }).contestType === "combined";

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow="League Room"
          title={fullData.league.name}
          description={`Competing on ${fullData.contest!.name}.`}
        />
        <div className="pill-row">
          <span className="pill">{fullData.league.visibility}</span>
          {fullData.league.joinCode ? (
            <CopyInviteButton code={fullData.league.joinCode} leagueId={fullData.league._id} />
          ) : null}
        </div>
      </section>

      <section className="league-grid">
        <div className="panel">
          <h2 className="section-title">Current Standings</h2>
          <LeaderboardTable entries={fullData.leaderboard ?? []} />
        </div>

        <div className="panel">
          <h2 className="section-title">League Actions</h2>
          {!isSignedIn ? (
            <AuthPrompt
              title="Sign in to join"
              description="Public standings are readable, but joining and saving picks still requires an account."
            />
          ) : fullData.league.hasJoined ? (
            <button
              className="button button--secondary button--full"
              onClick={() => void handleLeave()}
              type="button"
            >
              Leave League
            </button>
          ) : (
            <>
              {fullData.league.visibility === "private" ? (
                <label className="field">
                  <span>Invite Code</span>
                  <input
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder={fullData.league.joinCode ?? "AB12CD34"}
                    value={joinCode}
                  />
                </label>
              ) : null}
              <button
                className="button button--primary button--full"
                onClick={() => void handleJoin()}
                type="button"
              >
                Join League
              </button>
            </>
          )}
          {message ? <p className="inline-message">{message}</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Member Predictions</h2>
        <div className="member-list">
          {(fullData.members ?? []).map((member) => (
            <details className="member-card" key={member.user._id}>
              <summary>
                <span>{member.user.name}</span>
                <span>
                  {member.prediction?.totalScore === null ||
                  member.prediction?.totalScore === undefined
                    ? "No score yet"
                    : `${member.prediction.totalScore} pts`}
                </span>
              </summary>
              {member.prediction && isCombinedContest && "gfRows" in member.prediction ? (
                <CombinedPredictionDisplay prediction={member.prediction as CombinedPrediction} />
              ) : member.prediction && "rows" in member.prediction ? (
                <PredictionTable compact rows={(member.prediction as { rows: PredictionRowData[] }).rows} />
              ) : null}
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function SharedPredictionPage() {
  const { predictionId = "" } = useParams();
  const data = useQuery(
    api.predictions.getSharedPrediction,
    predictionId ? { predictionId: predictionId as Id<"predictions"> } : "skip",
  );

  const topRow = data
    ? "rows" in data.prediction
      ? (data.prediction.rows as PredictionRowData[])[0]
      : "gfRows" in data.prediction
        ? (data.prediction as { gfRows: PredictionRowData[] }).gfRows[0]
        : null
    : null;

  usePageMeta(
    data ? `${data.user.name}'s ${data.contest.shortName} Picks` : "Shared Prediction",
    {
      description: data
        ? `See ${data.user.name}'s predicted ranking for ${data.contest.name} on FantasyVision.${topRow ? ` Their #1 pick: ${topRow.country} — ${topRow.artist}, "${topRow.song}".` : ""}`
        : undefined,
      imageUrl: topRow
        ? `https://flagcdn.com/w320/${topRow.countryCode.toLowerCase()}.png`
        : undefined,
    },
  );

  if (data === undefined) {
    return <LoadingState label="Opening shared prediction..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="Prediction not found"
        description="This share link may be old, or the prediction was never saved."
      />
    );
  }

  const isCombined = "gfRows" in data.prediction;

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow="Fan Prediction"
          title={`${data.user.name}'s ${data.contest.shortName} board`}
          description={`See how ${data.user.name}'s picks play out when the votes come in — and make your own to challenge them!`}
        />
        {isCombined ? (
          <CombinedScoreBanner
            prediction={data.prediction as CombinedPrediction}
            predictionId={data.prediction._id}
          />
        ) : (
          <div className="score-banner">
            <div>
              <strong>
                {"totalScore" in data.prediction && data.prediction.totalScore === null
                  ? "Awaiting results"
                  : `${"totalScore" in data.prediction ? data.prediction.totalScore : 0} points`}
              </strong>
              <span>
                {"totalScore" in data.prediction && data.prediction.totalScore === null
                  ? "Placements are not available yet."
                  : `Maximum possible score: ${"maxPossibleScore" in data.prediction ? data.prediction.maxPossibleScore : 0}`}
              </span>
            </div>
            <Link className="button button--accent" to="/predict">
              Make Your Own
            </Link>
          </div>
        )}
      </section>

      {isCombined ? (
        <CombinedPredictionDisplay prediction={data.prediction as CombinedPrediction} />
      ) : (
        <PredictionTable rows={"rows" in data.prediction ? (data.prediction.rows as PredictionRowData[]) : []} />
      )}

      <section className="panel share-league-cta">
        <p className="eyebrow">Compete with friends</p>
        <h2 className="section-title">Think you can do better?</h2>
        <p className="muted-copy">
          Create a private league, share the code with your group, and find out who really knows their douze points when the results roll in.
        </p>
        <div className="hero__actions">
          <Link className="button button--primary" to="/predict">Make Your Own Picks</Link>
          <Link className="button button--secondary" to="/leagues">Find a League →</Link>
        </div>
      </section>
    </div>
  );
}

function PredictionTable({
  rows,
  compact = false,
  backfilledIds,
}: {
  rows: PredictionRowData[];
  compact?: boolean;
  backfilledIds?: Set<Id<"contestants">>;
}) {
  return (
    <div className={compact ? "prediction-table prediction-table--compact" : "prediction-table"}>
      {rows.map((row) => (
        <article className="prediction-row" key={`${row.contestantId}-${row.predictedRank}`}>
          <img alt={`${row.country} flag`} className="prediction-row__image" src={`https://flagcdn.com/w80/${row.countryCode.toLowerCase()}.png`} />
          <div className="prediction-row__copy">
            <div className="prediction-row__headline">
              <span className="rank-chip">#{row.predictedRank}</span>
              <strong>{row.country}</strong>
              <span>
                {flagFromCountryCode(row.countryCode)} {row.artist} - "{row.song}"
              </span>
              {backfilledIds?.has(row.contestantId) && (
                <span className="pill pill--soft">Backfilled</span>
              )}
            </div>
            <div className="prediction-row__meta">
              <span>
                {row.actualPlacement === null
                  ? "Awaiting official placement"
                  : `Actual placement: ${row.actualPlacement}`}
              </span>
              <span>{row.entryScore === null ? "Not scored yet" : `${row.entryScore} pts`}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function LeaderboardTable({
  entries,
}: {
  entries: Array<{
    userId: Id<"users">;
    userName: string;
    imageUrl?: string | null;
    totalScore: number;
    rank: number;
  }>;
}) {
  if (entries.length === 0) {
    return (
      <div className="empty-section">
        <p className="muted-copy">No scores yet — save a prediction to get on the board.</p>
        <Link className="button button--accent" to="/predict">Make a Prediction →</Link>
      </div>
    );
  }

  return (
    <div className="leaderboard-table">
      {entries.map((entry) => (
        <div className="leaderboard-row" key={`${entry.userId}-${entry.rank}`}>
          <span className="leaderboard-row__rank">{entry.rank}</span>
          <span className="leaderboard-row__name">{entry.userName}</span>
          <span className="leaderboard-row__score">{entry.totalScore} pts</span>
        </div>
      ))}
    </div>
  );
}

function ContestantRankCard({
  contestant,
  index,
  isFirst,
  isLast,
  moveUp,
  moveDown,
  draggedId,
  onDragStart,
  onDropOn,
  onDragEnd,
  semiGroupBadge = null,
  isAutoQualifier = false,
}: {
  contestant: ContestantDoc;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  moveUp: () => void;
  moveDown: () => void;
  draggedId: Id<"contestants"> | null;
  onDragStart: () => void;
  onDropOn: (sourceId: Id<"contestants">, targetId: Id<"contestants">) => void;
  onDragEnd: () => void;
  semiGroupBadge?: "semi1" | "semi2" | "auto" | null;
  isAutoQualifier?: boolean;
}) {
  const isDragging = draggedId === contestant._id;
  const isTopRanked = index === 0;

  let cardClass = "contestant-card";
  if (isDragging) cardClass += " contestant-card--dragging";
  if (isTopRanked) cardClass += " contestant-card--top";

  return (
    <article
      className={cardClass}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (draggedId) {
          onDropOn(draggedId, contestant._id);
        }
      }}
    >
      <div className="contestant-card__rank">{isTopRanked ? "👑" : index + 1}</div>
      <img
        alt={`${contestant.country} flag`}
        className="contestant-card__image"
        src={`https://flagcdn.com/w80/${contestant.countryCode.toLowerCase()}.png`}
      />
      <div className="contestant-card__copy">
        <strong>{contestant.country}</strong>
        <span>
          {flagFromCountryCode(contestant.countryCode)} {contestant.artist}
        </span>
        <p>"{contestant.song}"</p>
        {semiGroupBadge && (
          <span className={`semi-badge semi-badge--${semiGroupBadge}`}>
            {semiGroupBadge === "auto"
              ? "AUTO"
              : semiGroupBadge === "semi1"
                ? "SF1"
                : "SF2"}
          </span>
        )}
      </div>
      <div className="contestant-card__actions">
        <span className="drag-handle" aria-hidden="true">
          Drag
        </span>
        <button className="chip-button" disabled={isFirst} onClick={moveUp} type="button">
          Up
        </button>
        <button
          className="chip-button"
          disabled={isLast || (isAutoQualifier && index >= 24)}
          onClick={moveDown}
          type="button"
        >
          Down
        </button>
      </div>
    </article>
  );
}

function CopyShareButton({ predictionId }: { predictionId: Id<"predictions"> }) {
  const [status, setStatus] = useState("Copy Share Link");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${predictionId}`);
      setStatus("Copied");
      window.setTimeout(() => setStatus("Copy Share Link"), 1500);
    } catch {
      setStatus("Copy failed");
    }
  };

  return (
    <button className="button button--secondary" onClick={() => void handleCopy()} type="button">
      {status}
    </button>
  );
}

function InfoCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="info-card">
      <h2>{title}</h2>
      <p>{description}</p>
    </article>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-description">{description}</p>
    </div>
  );
}

function LeagueMiniCard({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  return (
    <Link className="mini-card" to={href}>
      <strong>{title}</strong>
      <span>{meta}</span>
    </Link>
  );
}

function AuthPrompt({ title, description }: { title: string; description: string }) {
  return (
    <div className="auth-prompt">
      <strong>{title}</strong>
      <p>{description}</p>
      <div className="hero__actions">
        <SignInButton mode="modal">
          <button className="button button--secondary">Log In</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="button button--primary">Sign Up</button>
        </SignUpButton>
      </div>
    </div>
  );
}

const LEAGUE_EXPLAINER_KEY = "fv_league_explainer_seen";

function LeagueExplainer() {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(LEAGUE_EXPLAINER_KEY) === "1",
  );

  if (dismissed) return null;

  return (
    <div className="league-explainer">
      <div className="league-explainer__body">
        <p className="eyebrow">How leagues work</p>
        <p>
          Everyone saves their Eurovision prediction. A league keeps your crew in one room.
          When the votes come in, the leaderboard reveals who really knows their douze points.
        </p>
      </div>
      <button
        className="league-explainer__dismiss"
        onClick={() => {
          window.localStorage.setItem(LEAGUE_EXPLAINER_KEY, "1");
          setDismissed(true);
        }}
        type="button"
        aria-label="Dismiss explainer"
      >
        ✕
      </button>
    </div>
  );
}

function CopyInviteButton({ code, leagueId }: { code: string; leagueId: Id<"leagues"> }) {
  const [codeStatus, setCodeStatus] = useState("Copy Code");
  const [linkStatus, setLinkStatus] = useState("Copy Invite Link");

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeStatus("Copied!");
      window.setTimeout(() => setCodeStatus("Copy Code"), 1500);
    }).catch(() => setCodeStatus("Failed"));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/leagues/${leagueId}`).then(() => {
      setLinkStatus("Copied!");
      window.setTimeout(() => setLinkStatus("Copy Invite Link"), 1500);
    }).catch(() => setLinkStatus("Failed"));
  };

  return (
    <div className="invite-actions">
      <span className="pill pill--soft invite-code">{code}</span>
      <button className="button button--secondary" onClick={copyCode} type="button">
        {codeStatus}
      </button>
      <button className="button button--secondary" onClick={copyLink} type="button">
        {linkStatus}
      </button>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: ReactNode;
}) {
  return (
    <section className="empty-panel">
      <p className="eyebrow">FantasyVision</p>
      <h1>{title}</h1>
      <p>{description}</p>
      {cta}
    </section>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <section className="empty-panel">
      <p className="eyebrow">Loading</p>
      <h1>{label}</h1>
      <p>The app is pulling together the latest contest data for this page.</p>
    </section>
  );
}

function ProfilePage() {
  usePageMeta("Your Profile");
  const viewer = useQuery(api.users.getViewer);
  const updateDisplayName = useMutation(api.users.updateDisplayName);
  const updatePublicNamePreference = useMutation(api.users.updatePublicNamePreference);
  const { isSignedIn } = useUser();
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // null means "not yet edited by the user" — show the saved value as the pre-fill
  const draftValue = draft ?? (viewer ? (viewer.displayName ?? viewer.name) : "");

  if (!isSignedIn) {
    return (
      <EmptyPanel
        title="Sign in to view your profile"
        description="You need to be signed in to manage your display name."
        cta={
          <SignInButton mode="modal">
            <button className="button button--primary">Log In / Sign Up</button>
          </SignInButton>
        }
      />
    );
  }

  if (viewer === undefined) {
    return <LoadingState label="Loading your profile..." />;
  }

  if (!viewer) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    updateDisplayName({ displayName: draftValue })
      .then(() => setMessage("Display name updated."))
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Something went wrong."));
  };

  // Show the preference toggle only when the user has a handle that differs from their Clerk name
  const hasHandle = Boolean(viewer.displayName) && viewer.displayName !== viewer.name;
  const usingHandle = hasHandle && viewer.useDisplayName !== false;

  const handleTogglePublicName = () => {
    updatePublicNamePreference({ useDisplayName: !usingHandle })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Something went wrong."));
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <PageHeading
          eyebrow="Account"
          title="Your Profile"
          description="Set a display name that other players will see in leagues and on shared predictions."
        />
        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Display Name / Handle</span>
            <input
              maxLength={50}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Fantasy Fan"
              type="text"
              value={draftValue}
            />
          </label>
          {message && <p className="status-message">{message}</p>}
          <div className="form-actions">
            <button className="button button--primary" disabled={draftValue.trim().length === 0} type="submit">
              Save
            </button>
          </div>
        </form>

        {hasHandle && (
          <div className="profile-name-pref">
            <p className="muted-copy">
              You have both a Clerk account name (<strong>{viewer.name}</strong>) and a handle (<strong>{viewer.displayName}</strong>).
              Choose which one appears publicly in leagues and on shared predictions.
            </p>
            <div className="profile-name-pref__options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="publicName"
                  checked={usingHandle}
                  onChange={() => { if (!usingHandle) handleTogglePublicName(); }}
                />
                <span>
                  Use handle: <strong>{viewer.displayName}</strong>
                </span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="publicName"
                  checked={!usingHandle}
                  onChange={() => { if (usingHandle) handleTogglePublicName(); }}
                />
                <span>
                  Use account name: <strong>{viewer.name}</strong>
                </span>
              </label>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <p>&copy; {year} FantasyVision. May the best song win!</p>
      <p>
        Made with love as a fan project. Eurovision and all related trademarks are property of the
        EBU. This application is not affiliated with or endorsed by the EBU.
      </p>
    </footer>
  );
}

function loadComposerRanking(data: PredictComposerData) {
  const localRanking = readLocalRanking(data.contest._id, data.contestants);
  if (localRanking.length === data.contestants.length) {
    return localRanking;
  }
  return hydrateRanking(data.contestants, data.existingRanking);
}

function hydrateRanking(
  contestants: ContestantDoc[],
  existingRanking: Id<"contestants">[] | null,
) {
  const contestantsById = new Map(contestants.map((contestant) => [contestant._id, contestant]));
  const existing = existingRanking
    ?.map((contestantId) => contestantsById.get(contestantId))
    .filter((contestant): contestant is ContestantDoc => Boolean(contestant));

  return existing && existing.length === contestants.length ? existing : contestants;
}

function getLocalPredictionKey(contestId: Id<"contests">) {
  return `${LOCAL_PREDICTION_PREFIX}_${contestId}`;
}

function readLocalRanking(contestId: Id<"contests">, contestants: ContestantDoc[]) {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getLocalPredictionKey(contestId));
  if (!raw) {
    return [];
  }

  try {
    const ids = JSON.parse(raw) as Id<"contestants">[];
    if (!Array.isArray(ids)) {
      return [];
    }

    const contestantsById = new Map(contestants.map((contestant) => [contestant._id, contestant]));
    const local = ids
      .map((contestantId) => contestantsById.get(contestantId))
      .filter((contestant): contestant is ContestantDoc => Boolean(contestant));

    return local.length === contestants.length ? local : [];
  } catch {
    return [];
  }
}

function writeLocalRanking(contestId: Id<"contests">, ranking: ContestantDoc[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getLocalPredictionKey(contestId),
    JSON.stringify(ranking.map((contestant) => contestant._id)),
  );
}

function clearLocalRanking(contestId: Id<"contests">) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getLocalPredictionKey(contestId));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const boundedTarget = Math.max(0, Math.min(items.length - 1, toIndex));
  if (fromIndex === boundedTarget || fromIndex < 0 || boundedTarget < 0) {
    return items;
  }

  const copy = [...items];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(boundedTarget, 0, item);
  return copy;
}

function labelContestStatus(status: "draft" | "open" | "results" | "archived") {
  switch (status) {
    case "draft":
      return "Draft";
    case "open":
      return "Open";
    case "results":
      return "Results Live";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

function flagFromCountryCode(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (character) => String.fromCodePoint(127397 + character.charCodeAt(0)));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
