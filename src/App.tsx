import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

import type { Doc, Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

type ContestantDoc = Doc<"contestants">;
type PredictComposerData = {
  contest: {
    _id: Id<"contests">;
    slug: string;
    season: number;
    name: string;
    shortName: string;
    description: string;
    heroBlurb: string;
    status: "draft" | "open" | "results" | "archived";
    predictionCutoff: number | null;
  };
  contestants: ContestantDoc[];
  existingRanking: Id<"contestants">[] | null;
  viewer: {
    _id: Id<"users">;
    name: string;
    imageUrl: string | null;
  } | null;
};

const SCORE_LABELS = [
  "12 for an exact hit",
  "10 for being one place away",
  "8 for being two away",
  "7, 6, 5, 4, 3, 2, 1 as the miss widens out to nine places",
] as const;

export default function App() {
  return (
    <BrowserRouter>
      <ViewerBootstrap />
      <div className="app-shell">
        <SiteHeader />
        <main className="site-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/predict" element={<PredictPage />} />
            <Route path="/my-picks" element={<MyPicksPage />} />
            <Route path="/leagues" element={<LeaguesPage />} />
            <Route path="/leagues/:leagueId" element={<LeagueDetailPage />} />
            <Route path="/share/:predictionId" element={<SharedPredictionPage />} />
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
  const upsertViewer = useMutation(api.users.upsertViewer);
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      lastSyncedUserId.current = null;
      return;
    }

    if (lastSyncedUserId.current === user.id) {
      return;
    }

    lastSyncedUserId.current = user.id;
    void upsertViewer({}).catch(() => {
      lastSyncedUserId.current = null;
    });
  }, [isLoaded, isSignedIn, upsertViewer, user]);

  return null;
}

function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" to="/">
          <span className="brand__spark" />
          <span>
            <strong>FantasyVision</strong>
            <small>React + Convex rebuild</small>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          <NavItem to="/">Home</NavItem>
          <NavItem to="/predict">Predict</NavItem>
          <NavItem to="/my-picks">My Picks</NavItem>
          <NavItem to="/leagues">Leagues</NavItem>
        </nav>

        <div className="site-header__auth">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="button button--ghost">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="button button--primary">Create account</button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      className={({ isActive }) =>
        isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
      }
      to={to}
    >
      {children}
    </NavLink>
  );
}

function HomePage() {
  const home = useQuery(api.contests.getHomeData, {});

  if (home === undefined) {
    return <LoadingState label="Loading the green room..." />;
  }

  if (!home.activeContest || !home.stats) {
    return (
      <EmptyPanel
        title="No active contest yet"
        description="Seed the legacy data first, then the rebuilt app will light up automatically."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="eyebrow">Fresh stack, same obsession</p>
          <h1>{home.activeContest.shortName}</h1>
          <p className="hero-panel__lede">{home.activeContest.heroBlurb}</p>
          <div className="hero-panel__actions">
            <Link className="button button--primary" to="/predict">
              Start ranking
            </Link>
            <Link className="button button--ghost" to="/leagues">
              Browse leagues
            </Link>
          </div>
        </div>

        <div className="stats-grid">
          <StatCard label="Contestants" value={home.stats.contestants} />
          <StatCard label="Saved picks" value={home.stats.predictions} />
          <StatCard label="Public leagues" value={home.stats.publicLeagues} />
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <PanelHeading
            eyebrow="Live now"
            title={home.activeContest.name}
            description={home.activeContest.description}
          />
          <div className="badge-row">
            <span className="pill">{labelContestStatus(home.activeContest.status)}</span>
            <span className="pill pill--soft">Season {home.activeContest.season}</span>
          </div>
          <p className="panel-copy">
            The old Firebase build is now just source material. This version uses
            Convex documents and joins where they actually fit the app: one active
            contest, one prediction per user per contest, and dedicated league
            memberships for leaderboard queries.
          </p>
        </div>

        <div className="panel">
          <PanelHeading
            eyebrow="Spotlight"
            title="Public leagues"
            description="Quick rooms to jump into without waiting on an invite."
          />
          <div className="card-list">
            {home.spotlightLeagues.length === 0 ? (
              <p className="muted-copy">No public leagues yet. You can be first.</p>
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
      </section>

      <section className="panel">
        <PanelHeading
          eyebrow="Archive"
          title="Past seasons already seeded"
          description="Useful for retro leagues while the 2026 entrants are still to come."
        />
        <div className="archive-grid">
          {home.archivedContests.map((contest) => (
            <article className="archive-card" key={contest._id}>
              <h3>{contest.shortName}</h3>
              <p>{contest.description}</p>
              <span className="pill pill--soft">{labelContestStatus(contest.status)}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PredictPage() {
  const { isLoaded, isSignedIn } = useUser();
  const data = useQuery(api.contests.getPredictPageData, {});

  if (data === undefined || !isLoaded) {
    return <LoadingState label="Building the scoreboard..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="No contest is active"
        description="Seed the data first, then this page will turn into the ranking composer."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <PageHeading
          eyebrow="Prediction composer"
          title={`Rank ${data.contest.shortName}`}
          description="Move each act into your predicted finishing order. The save is idempotent, so you can keep refining your board."
        />
        <div className="badge-row">
          <span className="pill">{labelContestStatus(data.contest.status)}</span>
          {data.existingRanking ? <span className="pill pill--soft">Saved pick loaded</span> : null}
        </div>
      </section>

      <PredictComposer data={data} isSignedIn={Boolean(isSignedIn)} key={data.contest._id} />
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
  const savePrediction = useMutation(api.predictions.saveViewerPrediction);
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<ContestantDoc[]>(() =>
    hydrateRanking(data.contestants, data.existingRanking),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const save = async () => {
    try {
      const predictionId = await savePrediction({
        contestId: data.contest._id,
        ranking: ranking.map((contestant) => contestant._id),
      });
      setStatusMessage("Prediction saved. Your score view is ready.");
      void navigate(`/share/${predictionId}`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="content-grid">
      <section className="panel panel--tall">
        <div className="panel__header-row">
          <PanelHeading
            eyebrow="Your board"
            title="Drag-free, fast ranking"
            description="The old app supported drag and drop. This rebuild keeps the flow but biases for speed and mobile friendliness."
          />
          <button
            className="button button--ghost"
            onClick={() => setRanking([...data.contestants])}
            type="button"
          >
            Reset order
          </button>
        </div>

        <div className="ranking-list">
          {ranking.map((contestant, index) => (
            <ContestantRankCard
              contestant={contestant}
              index={index}
              key={contestant._id}
              moveToTop={() => setRanking((current) => moveItem(current, index, 0))}
              moveUp={() => setRanking((current) => moveItem(current, index, index - 1))}
              moveDown={() => setRanking((current) => moveItem(current, index, index + 1))}
              isFirst={index === 0}
              isLast={index === ranking.length - 1}
            />
          ))}
        </div>
      </section>

      <aside className="panel panel--sticky">
        <PanelHeading
          eyebrow="Scoring"
          title="Eurovision-style distance points"
          description="Exact calls get the big returns, but near misses still matter."
        />
        <ul className="score-list">
          {SCORE_LABELS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <SignedOut>
          <AuthPrompt
            title="Sign in to save"
            description="Clerk social sign-in is wired in, so your board can follow you into leagues and shared links."
          />
        </SignedOut>

        <SignedIn>
          <button
            className="button button--primary button--full"
            onClick={() => void save()}
            type="button"
          >
            Save prediction
          </button>
        </SignedIn>

        {statusMessage ? <p className="inline-message">{statusMessage}</p> : null}

        {!isSignedIn ? (
          <p className="muted-copy">
            You can still reorder everything before signing in. Saving and league play kick in once you're authenticated.
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function hydrateRanking(
  contestants: ContestantDoc[],
  existingRanking: Id<"contestants">[] | null,
) {
  const contestantsById = new Map(
    contestants.map((contestant) => [contestant._id, contestant]),
  );
  const existing = existingRanking
    ?.map((contestantId) => contestantsById.get(contestantId))
    .filter((contestant): contestant is ContestantDoc => Boolean(contestant));

  return existing && existing.length === contestants.length ? existing : contestants;
}

function MyPicksPage() {
  const data = useQuery(api.predictions.getViewerPrediction, {});

  if (data === undefined) {
    return <LoadingState label="Loading your saved picks..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="No active contest yet"
        description="Seed the contest data first so this page can show your saved ranking."
      />
    );
  }

  if (!data.prediction) {
    return (
      <EmptyPanel
        title="No saved pick yet"
        description={`You haven't locked in a board for ${data.contest.shortName} yet.`}
        cta={<Link className="button button--primary" to="/predict">Make your prediction</Link>}
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <PageHeading
          eyebrow="My picks"
          title={`${data.contest.shortName} scorecard`}
          description="One saved prediction per contest, with a clean share URL and calculated score whenever placements are available."
        />
        <div className="score-banner">
          <div>
            <strong>
              {data.prediction.totalScore === null
                ? "Awaiting results"
                : `${data.prediction.totalScore} points`}
            </strong>
            <span>
              {data.prediction.totalScore === null
                ? "Scores appear as soon as the contest has placements."
                : `Maximum possible: ${data.prediction.maxPossibleScore}`}
            </span>
          </div>
          <CopyShareButton predictionId={data.prediction._id} />
        </div>
      </section>

      <PredictionTable rows={data.prediction.rows} />
    </div>
  );
}

function LeaguesPage() {
  const hub = useQuery(api.leagues.getLeaguesHub, {});
  const createLeague = useMutation(api.leagues.createLeague);
  const joinLeagueByCode = useMutation(api.leagues.joinLeagueByCode);
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (hub === undefined) {
    return <LoadingState label="Gathering the league standings..." />;
  }

  if (!hub) {
    return (
      <EmptyPanel
        title="No active contest for leagues"
        description="Seed contest data first so league creation has somewhere to attach."
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

  const handleJoinPrivate = async () => {
    try {
      const leagueId = await joinLeagueByCode({ joinCode });
      void navigate(`/leagues/${leagueId}`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <PageHeading
          eyebrow="Leagues"
          title={`Play ${hub.contest.shortName} with friends`}
          description="League membership is stored separately from the league doc, so lookups stay clean as the app grows."
        />
      </section>

      <div className="content-grid">
        <section className="panel">
          <PanelHeading
            eyebrow="Create"
            title="Start a league"
            description="Public leagues are open immediately. Private ones get a compact invite code."
          />
          <SignedOut>
            <AuthPrompt
              title="Sign in to create"
              description="League creation is tied to your Clerk account so we can keep creator permissions sane."
            />
          </SignedOut>
          <SignedIn>
            <label className="field">
              <span>League name</span>
              <input
                onChange={(event) => setLeagueName(event.target.value)}
                placeholder="Northern jury favourites"
                value={leagueName}
              />
            </label>
            <div className="segmented">
              <button
                className={visibility === "public" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => setVisibility("public")}
                type="button"
              >
                Public
              </button>
              <button
                className={visibility === "private" ? "segmented__item segmented__item--active" : "segmented__item"}
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
              Create league
            </button>
          </SignedIn>
          {message ? <p className="inline-message">{message}</p> : null}
        </section>

        <section className="panel">
          <PanelHeading
            eyebrow="Invite"
            title="Join with a code"
            description="Private league codes are deterministic from the league id right now, which keeps the backend simple and reliable."
          />
          <label className="field">
            <span>Invite code</span>
            <input
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="AB12CD34"
              value={joinCode}
            />
          </label>
          <button
            className="button button--ghost button--full"
            onClick={() => void handleJoinPrivate()}
            type="button"
          >
            Check code
          </button>
          <p className="muted-copy">
            Private joins complete from the league detail page once you have the right code.
          </p>
        </section>
      </div>

      <section className="panel">
        <PanelHeading
          eyebrow="Your leagues"
          title="Memberships for this contest"
          description="Only leagues tied to the active contest are shown here."
        />
        <div className="card-list">
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
        <PanelHeading
          eyebrow="Public board"
          title="Open leagues"
          description="Jump straight into an existing room or inspect its leaderboard first."
        />
        <div className="archive-grid">
          {hub.publicLeagues.map((league) => (
            <article className="league-card" key={league._id}>
              <div>
                <h3>{league.name}</h3>
                <p>{league.memberCount} member{league.memberCount === 1 ? "" : "s"}</p>
              </div>
              <div className="league-card__actions">
                <span className="pill pill--soft">{league.hasJoined ? "Joined" : "Public"}</span>
                <Link className="button button--ghost" to={`/leagues/${league._id}`}>
                  Open
                </Link>
              </div>
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

  if (data === undefined) {
    return <LoadingState label="Loading league detail..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="League not found"
        description="This room might have been deleted, or the share link is wrong."
      />
    );
  }

  if (data.access !== "full") {
    return (
      <EmptyPanel
        title={`${data.league.name} is private`}
        description="Sign in and use the invite code from the host to unlock the room."
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

  return (
    <div className="page-stack">
      <section className="page-intro">
        <PageHeading
          eyebrow="League room"
          title={fullData.league.name}
          description={`Competing on ${fullData.contest!.name}.`}
        />
        <div className="badge-row">
          <span className="pill">{fullData.league.visibility}</span>
          {fullData.league.joinCode ? <span className="pill pill--soft">Invite {fullData.league.joinCode}</span> : null}
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <PanelHeading
            eyebrow="Leaderboard"
            title="Current standings"
            description="Scores are computed from each member's saved prediction against the contest placements."
          />
          <LeaderboardTable entries={fullData.leaderboard ?? []} />
        </div>

        <div className="panel panel--sticky">
          <PanelHeading
            eyebrow="Actions"
            title="Membership"
            description="Use this side panel to join, leave, or share the invite code."
          />

          {!isSignedIn ? (
            <AuthPrompt
              title="Sign in to join"
              description="Public league data is readable, but joining and saving picks requires an authenticated profile."
            />
          ) : fullData.league.hasJoined ? (
            <button
              className="button button--ghost button--full"
              onClick={() => void handleLeave()}
              type="button"
            >
              Leave league
            </button>
          ) : (
            <>
              {fullData.league.visibility === "private" ? (
                <label className="field">
                  <span>Invite code</span>
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
                Join league
              </button>
            </>
          )}

          {message ? <p className="inline-message">{message}</p> : null}
        </div>
      </section>

      <section className="panel">
        <PanelHeading
          eyebrow="Member picks"
          title="Saved prediction snapshots"
          description="Useful for league banter and tie-break arguments."
        />
        <div className="member-list">
          {(fullData.members ?? []).map((member) => (
            <details className="member-card" key={member.user._id}>
              <summary>
                <div>
                  <strong>{member.user.name}</strong>
                  <span>
                    {member.prediction?.totalScore === null || member.prediction?.totalScore === undefined
                      ? "No score yet"
                      : `${member.prediction.totalScore} pts`}
                  </span>
                </div>
                <span>{member.prediction ? "Open picks" : "No prediction saved"}</span>
              </summary>
              {member.prediction ? <PredictionTable rows={member.prediction.rows} compact /> : null}
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

  if (data === undefined) {
    return <LoadingState label="Opening shared prediction..." />;
  }

  if (!data) {
    return (
      <EmptyPanel
        title="Prediction not found"
        description="The link may be old, or the prediction was never saved."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <PageHeading
          eyebrow="Shared prediction"
          title={`${data.user.name}'s ${data.contest.shortName} board`}
          description="A direct share view backed by the saved prediction document id."
        />
        <div className="score-banner">
          <div>
            <strong>
              {data.prediction.totalScore === null
                ? "Awaiting results"
                : `${data.prediction.totalScore} points`}
            </strong>
            <span>
              {data.prediction.totalScore === null
                ? "Placements not available yet."
                : `Maximum possible: ${data.prediction.maxPossibleScore}`}
            </span>
          </div>
          <Link className="button button--ghost" to="/predict">
            Make your own
          </Link>
        </div>
      </section>

      <PredictionTable rows={data.prediction.rows} />
    </div>
  );
}

function PredictionTable({
  rows,
  compact = false,
}: {
  rows: Array<{
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
    points?: number;
  }>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "prediction-table prediction-table--compact" : "prediction-table"}>
      {rows.map((row) => (
        <article className="prediction-row" key={`${row.contestantId}-${row.predictedRank}`}>
          <div className="prediction-row__media">
            <img alt={`${row.country} entry`} src={row.imageUrl} />
          </div>
          <div className="prediction-row__copy">
            <div className="prediction-row__topline">
              <span className="rank-chip">#{row.predictedRank}</span>
              <strong>{row.country}</strong>
              <span>{row.artist} with {row.song}</span>
            </div>
            <div className="prediction-row__meta">
              <span>{flagFromCountryCode(row.countryCode)} {row.countryCode}</span>
              <span>
                {row.actualPlacement === null
                  ? "Awaiting official placement"
                  : `Actual placement: ${row.actualPlacement}`}
              </span>
              <span>
                {row.entryScore === null ? "Not scored yet" : `${row.entryScore} pts`}
              </span>
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
    return <p className="muted-copy">No scores yet. Save a prediction and this table will wake up.</p>;
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

function CopyShareButton({ predictionId }: { predictionId: Id<"predictions"> }) {
  const [status, setStatus] = useState("Copy share link");

  const copy = async () => {
    const url = `${window.location.origin}/share/${predictionId}`;
    await navigator.clipboard.writeText(url);
    setStatus("Copied");
    window.setTimeout(() => setStatus("Copy share link"), 1500);
  };

  return (
    <button className="button button--ghost" onClick={() => void copy()} type="button">
      {status}
    </button>
  );
}

function ContestantRankCard({
  contestant,
  index,
  moveToTop,
  moveUp,
  moveDown,
  isFirst,
  isLast,
}: {
  contestant: ContestantDoc;
  index: number;
  moveToTop: () => void;
  moveUp: () => void;
  moveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <article className="contestant-card">
      <img alt={`${contestant.country} card`} className="contestant-card__image" src={contestant.imageUrl} />
      <div className="contestant-card__copy">
        <div className="contestant-card__topline">
          <span className="rank-chip">#{index + 1}</span>
          <strong>{contestant.country}</strong>
          <span>{flagFromCountryCode(contestant.countryCode)} {contestant.artist}</span>
        </div>
        <p>{contestant.song}</p>
      </div>
      <div className="contestant-card__actions">
        <button className="chip-button" disabled={isFirst} onClick={moveToTop} type="button">
          Top
        </button>
        <button className="chip-button" disabled={isFirst} onClick={moveUp} type="button">
          Up
        </button>
        <button className="chip-button" disabled={isLast} onClick={moveDown} type="button">
          Down
        </button>
      </div>
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

function PanelHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="panel-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
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
    <div>
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
      <div className="hero-panel__actions">
        <SignInButton mode="modal">
          <button className="button button--ghost">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="button button--primary">Create account</button>
        </SignUpButton>
      </div>
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
      <p>Convex is pulling together the latest state for this view.</p>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>FantasyVision is a fan-made contest game. Eurovision trademarks belong to the EBU.</p>
      <p>The legacy Firebase build is only kept here as a reference until you decide to delete it.</p>
    </footer>
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const boundedTarget = Math.max(0, Math.min(items.length - 1, toIndex));
  if (fromIndex === boundedTarget) {
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
      return "Results live";
    case "archived":
      return "Archive";
    default:
      return status;
  }
}

function flagFromCountryCode(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
