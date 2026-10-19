import React from 'react';
import './guides.css';

// Small line icons (24px grid, stroke = currentColor)
const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I = {
  line: 'M4 6h16M4 12h16M4 18h10',
  ball: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
  pause: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M10 9v6M14 9v6',
  hand: 'M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8.5a1.5 1.5 0 0 1 3 0V14c0 4-3 7-7 7s-6-2-7.5-5L3 13a1.5 1.5 0 0 1 2.5-1.5L7 13',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c0-4 4-6 8-6s8 2 8 6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6',
  board: 'M3 5h18v10H3zM8 19h8M12 15v4M7 10h2M15 10h2',
  tv: 'M3 6h18v11H3zM8 21h8M12 17v4',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2M11 18h2',
};
const Head: React.FC<{ icon: keyof typeof I; tone?: '' | 'o' | 'g' | 'd'; children: React.ReactNode }> = ({ icon, tone = '', children }) => (
  <div className="gd-h"><span className={`gd-ico ${tone}`}><Icon d={I[icon]} /></span><h3>{children}</h3></div>
);

export const GameRules: React.FC = () => (
  <div className="gd">
    <div className="gd-stats" role="list" aria-label="The basics">
      <div className="gd-stat" role="listitem"><b>5v5</b><span>Full court</span></div>
      <div className="gd-stat" role="listitem"><b>11</b><span>Win by 2</span></div>
      <div className="gd-stat" role="listitem"><b>15</b><span>First to 15 wins</span></div>
      <div className="gd-stat" role="listitem"><b>12:00</b><span>Game clock</span></div>
    </div>

    <section className="gd-sec">
      <Head icon="line">How the line works</Head>
      <ol className="gd-steps">
        <li>The first <strong>10</strong> to sign in play. Everyone else joins the line.</li>
        <li><strong>Winners stay</strong> on as the Champions.</li>
        <li><strong>Losers go to the back</strong> of the line together, as a group.</li>
        <li>The <strong>next five</strong> in line step in as the Challengers.</li>
      </ol>
      <p className="gd-sub mt-2">Subbed in during a game and your team lost? You go to the <strong>front</strong> of the line, not the back.</p>
    </section>

    <section className="gd-sec">
      <Head icon="user" tone="d">Your name</Head>
      <ul className="gd-list n">
        <li>Sign in with your <strong>first name and last initial</strong>, like Mike S.</li>
        <li>Two of you? The second one adds a letter, like <strong>Mike Sm.</strong>, or uses their full name.</li>
        <li>Known at the gym by a nickname? Go with it.</li>
        <li>Use the same name every time so your games add up.</li>
      </ul>
    </section>

    <section className="gd-sec">
      <Head icon="ball" tone="o">Scoring</Head>
      <ul className="gd-list">
        <li>Buckets count <strong>1</strong>, threes count <strong>2</strong>.</li>
        <li>First to <strong>11, win by 2</strong>. If nobody's up 2, <strong>first to 15</strong> wins.</li>
        <li>When the clock runs out, the <strong>team ahead wins</strong>. Tied? <strong>Next bucket wins.</strong></li>
        <li><strong>No free throws.</strong> Fouled on a shot, your team keeps the ball.</li>
        <li>Call your own fouls. Play fair and be respectful.</li>
      </ul>
    </section>

    <section className="gd-sec">
      <Head icon="target" tone="g">Three-point shootout</Head>
      <div className="gd-shoot">
        <p>Happens when the <strong>next group in line has more players than open spots</strong>. Only that group shoots, and nobody behind them skips ahead. If the line is short, it can be the team that just lost.</p>
        <p>Everyone takes <strong>one three</strong>.</p>
        <div className="gd-out">
          <div><b>Right number make it</b>They're in.</div>
          <div><b>Too few make it</b>The misses keep shooting until the spots fill.</div>
          <div><b>Too many make it</b>Only the makers shoot again until it's the right number.</div>
        </div>
        <p style={{ marginBottom: 0 }}>Anyone not picked goes to the <strong>front of the line</strong>.</p>
      </div>
    </section>

    <section className="gd-sec">
      <Head icon="pause" tone="d">Stepping away</Head>
      <ul className="gd-list n">
        <li>Leaving the line, even for a minute, means signing in again at the <strong>end of the line</strong>.</li>
      </ul>
    </section>

    <p className="gd-foot gd-display">Play fair, have fun, <span>keep it moving.</span></p>
  </div>
);

export const UserGuide: React.FC = () => (
  <div className="gd">
    <div className="gd-cards">
      <section className="gd-card">
        <Head icon="user" tone="o">Sign in</Head>
        <ul className="gd-list">
          <li>Tap <strong>Sign in</strong>, then your name.</li>
          <li>New? Type your <strong>first name and last initial</strong>, like Mike S. It's saved on this device for next time.</li>
          <li>The app tells you where you are, like "2 games away".</li>
        </ul>
      </section>

      <section className="gd-card">
        <Head icon="trophy">Run the night</Head>
        <ul className="gd-list n">
          <li>After each game, tap <strong>Champions Won</strong> or <strong>Challengers Won</strong>. The line moves on its own.</li>
          <li>A shootout pops up when one's needed. Tap who made it.</li>
          <li><strong>Undo</strong> steps back one change at a time, even after a refresh.</li>
        </ul>
      </section>

      <section className="gd-card">
        <Head icon="board" tone="d">Keep score <span className="tag" style={{ fontStyle: 'normal', fontFamily: 'inherit', verticalAlign: 'middle' }}>optional</span></Head>
        <ul className="gd-list n">
          <li>Tap <strong>Start</strong> at tip-off, then <strong>+1</strong> or <strong>+2</strong> for each bucket.</li>
          <li>The app calls the game and asks you to <strong>Record result</strong>.</li>
          <li>Mis-tap? <strong>Fix score</strong>. Clock off? Pause, then <strong>Adjust time</strong>.</li>
          <li>Keys: <span className="k">Q</span> <span className="k">W</span> Champions, <span className="k">O</span> <span className="k">P</span> Challengers, <span className="k">Space</span> clock, <span className="k">Ctrl Z</span> undo.</li>
        </ul>
      </section>

      <section className="gd-card">
        <Head icon="tv">Court view</Head>
        <ul className="gd-list n">
          <li>A big scoreboard with the teams and who's next. Use <strong>Full screen</strong> on a TV or tablet.</li>
          <li><strong>Second screen</strong> opens it in its own window. Drag it to the TV and keep running the night here.</li>
          <li>Wins get a celebration. <strong>Sound</strong> is off until you turn it on.</li>
        </ul>
      </section>

      <section className="gd-card">
        <Head icon="clock" tone="o">The line</Head>
        <ul className="gd-list">
          <li>Left: <strong>estimated wait</strong>. Right: <strong>games until up</strong>.</li>
          <li>When you keep score, the wait follows the scoreboard clock.</li>
          <li>A team that just lost stays grouped together.</li>
        </ul>
      </section>

      <section className="gd-card">
        <Head icon="chart">Recap</Head>
        <ul className="gd-list n">
          <li>Games, players, the longest streak and the most wins.</li>
          <li>Download a recap image for the group chat, or a backup.</li>
          <li><strong>Finish night</strong> saves it to Past nights and clears the courts.</li>
        </ul>
      </section>

      <section className="gd-card wide">
        <Head icon="phone" tone="o">Follow on your phone</Head>
        <div className="gd-two">
          <ul className="gd-list">
            <li>Open <strong>pickupbasketballmanager.com</strong> on your phone. It goes straight to tonight's run. No app, no account.</li>
            <li>Or scan the <strong>QR</strong> or type the <strong>6-letter code</strong> from the court screen.</li>
            <li>See who's playing, the score, and the line. Type your name in <strong>Where am I?</strong> to find your spot.</li>
            <li><strong>Stats</strong> for tonight and every run. Tap a name for that player's page.</li>
          </ul>
          <ul className="gd-list n">
            <li>Running the night? Tap <strong>Phone view</strong> and sign in once with your email.</li>
            <li><strong>Pause sharing</strong> stops updates. <strong>Reset link</strong> makes a new link and code and cuts off the old ones.</li>
          </ul>
        </div>
      </section>

      <section className="gd-card wide">
        <Head icon="move" tone="g">Move players with Manual mode</Head>
        <div className="gd-two">
          <ul className="gd-list">
            <li>Turn on <strong>Manual mode</strong>, tap a player, then tap where they go. Dragging works too.</li>
            <li>Tap a group's name to move the whole group.</li>
            <li>Someone hurt? Move them to the end of the line, then tap the next player and tap the open spot.</li>
            <li>A player who comes on mid-game is marked <strong>Sub</strong>. If their team loses, they go to the front of the line.</li>
          </ul>
          <ul className="gd-list">
            <li>To remove someone: <strong>Remove</strong> in Manual mode, right-click their name, or use the <strong>Name to remove</strong> box. If they come back, they sign in again at the end of the line.</li>
            <li>Tap <strong>Done</strong> when you're finished.</li>
          </ul>
        </div>
      </section>

      <section className="gd-card wide">
        <Head icon="save" tone="d">Saved as you go</Head>
        <ul className="gd-list n">
          <li>The night saves on this device. After a refresh or a closed tab, tap <strong>Resume session</strong>.</li>
        </ul>
      </section>
    </div>
  </div>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path fill="currentColor" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const MyStory: React.FC<{ photos: [string, string] }> = ({ photos }) => (
  <div className="gd">
    <div className="st-hero">
      <p className="st-eyebrow">Hi, I'm Kyle Tobin</p>
      <h3 className="st-title">Less arguing, <span>more ballin’.</span></h3>
      <p className="st-lede">I play pickup at Midtown Athletic Club in Chicago, and I designed and built this site so the run takes care of itself.</p>
      <div className="st-chips">
        <span>Multiple-time Midtown League champ</span>
        <span>Midtown Athletic Club regular</span>
        <span>Designer and developer</span>
      </div>
    </div>

    <div className="st-compare">
      <section className="st-col before">
        <h4>Before</h4>
        <ul className="gd-list n">
          <li>Names scribbled on paper, or kept in your head</li>
          <li>Arguments over who's next</li>
          <li>No idea how long you'd wait</li>
        </ul>
      </section>
      <section className="st-col after">
        <h4>Now</h4>
        <ul className="gd-list">
          <li>A fair rotation everyone can see</li>
          <li>Sign in with a tap and see your spot</li>
          <li>Wait times, a scoreboard and the game on the TV</li>
        </ul>
      </section>
    </div>

    <p className="st-goal">The goal is simple: <strong>a great run for everyone who shows up.</strong></p>

    <div className="st-photos">
      <figure><img src={photos[0]} alt="Midtown League champions" /></figure>
      <figure><img src={photos[1]} alt="Midtown League champions" /></figure>
    </div>

    <div className="st-connect">
      <p className="st-connect-title gd-display">Let's connect</p>
      <div className="st-links">
        <a className="st-link li" href="https://www.linkedin.com/in/kylegtobin/" target="_blank" rel="noopener noreferrer"><LinkedInIcon />LinkedIn</a>
        <a className="st-link ig" href="https://www.instagram.com/kyle.tobin/" target="_blank" rel="noopener noreferrer"><InstagramIcon />Instagram</a>
      </div>
    </div>

    <p className="gd-foot gd-display">See you on the court. <span>🏀</span></p>
  </div>
);
