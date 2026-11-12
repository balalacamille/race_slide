/* =====================================================================
   js/app.js  -  THE GAME PART
   This file connects the math (math.js) to the page (index.html).
   It has four jobs:
     1. Keep the score and switch between the two tabs
     2. The RACE tab:     make two formulas, animate the balls, show the answer
     3. The PRACTICE tab: make a question with 4 choices and check the answer
     4. Show the "how we did it" steps (used by both tabs)
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Tools used everywhere below ---------- */
  const M = window.SlideMath;                                   // the derivative functions from math.js
  const $ = (id) => document.getElementById(id);                // short way to find an element by its id
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));   // random whole number from a to b
  const shuffle = (arr) =>                                      // mixes up a list into a random order
    arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

  /* The names shown on the colored rule badges */
  const RULE_NAME = {
    constant: 'Constant Rule', power: 'Power Rule',
    multiple: 'Constant Multiple Rule', sum: 'Sum/Difference Rule'
  };

  /* =====================================================================
     1. SCORE AND TABS
     ===================================================================== */

  /* Every right answer gives 10 points. The score only lasts until the page is refreshed. */
  let score = 0;
  function addPoints(n) { score += n; $('score').textContent = score; }

  /* Clicking "Race" or "Practice" shows that tab and hides the other one */
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      ['race', 'practice'].forEach((n) => $('tab-' + n).classList.toggle('hidden', n !== btn.dataset.tab));
    });
  });

  /* =====================================================================
     4. THE "HOW WE DID IT" STEPS (used by Race and Practice)
     M.steps() gives us the explanation as data; this turns it into HTML:
     the colored rule badges, "piece → result", and the sentence below it.
     ===================================================================== */
  function stepsHtml(terms, v) {
    return '<ol class="steps">' + M.steps(terms, v).map((s) =>
      '<li>' + s.rules.map((r) => '<span class="chip ' + r + '">' + RULE_NAME[r] + '</span> ').join('') +
      '<div><span class="step-result">' + s.piece + ' → ' + s.result + '</span></div>' +
      '<small>' + s.text + '</small></li>'
    ).join('') + '</ol>';
  }

  /* =====================================================================
     2. THE RACE TAB

     The big idea:
       s = distance formula   (how far the ball has rolled)
       v = s′ = speed formula (the derivative of s)
     The students guess who is faster at 3 seconds. Then the derivative
     shows the real answer.
     ===================================================================== */

  const T_END = 3;   // the race lasts 3 seconds, and we compare the speeds at t = 3

  /* Where things are drawn in the picture (the numbers are positions in the SVG drawing) */
  const SLIDE_A = { x0: 40, y0: 60, x1: 270, y1: 250 };                    // straight slide: start (x0,y0) to end (x1,y1)
  const COIL = { cx: 480, y0: 56, h: 186, r: 80, tilt: 16, turns: 3 };    // spiral: center x, top y, height, radius, tilt, number of turns
  const SVG_NS = 'http://www.w3.org/2000/svg';                             // needed to create SVG shapes in code

  /* The race's memory:
       A, B   = the two distance formulas
       pick   = which ball the student chose
       scale  = the farthest distance, so the balls always fit on their slides */
  const race = { A: null, B: null, pick: null, running: false, raf: 0, scale: 1 };

  /* ---------- Drawing the spiral slide ---------- */

  /* coilPoint(f): where is the spiral a fraction f of the way down?
     f = 0 is the top, f = 1 is the bottom.
     We use cos and sin to go around in a circle while moving down.
     "front" tells us if that part of the spiral faces us or is behind the pole. */
  function coilPoint(f) {
    const angle = Math.PI + 2 * Math.PI * COIL.turns * f;
    return {
      x: COIL.cx + COIL.r * Math.cos(angle),
      y: COIL.y0 + COIL.h * f + COIL.tilt * Math.sin(angle),
      front: Math.sin(angle) >= 0
    };
  }

  /* drawCoil: builds the spiral out of many tiny straight lines.
     We draw the back part first, then the pole, then the front part,
     so the pole looks like it is inside the spiral. */
  function drawCoil() {
    const g = $('coil');
    const pieces = COIL.turns * 60;       // 60 tiny lines for every turn makes it look smooth

    function add(tag, attrs) {            // helper: make one SVG shape and put it in the picture
      const el = document.createElementNS(SVG_NS, tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      g.appendChild(el);
      return el;
    }

    [false, true].forEach((drawFront) => {           // first pass = back of spiral, second pass = front
      if (drawFront) {                               // between the two passes, draw the pole
        add('line', { x1: COIL.cx, y1: COIL.y0 - 16, x2: COIL.cx, y2: COIL.y0 + COIL.h + COIL.tilt, class: 'pole' });
      }
      for (let i = 0; i < pieces; i++) {
        const p1 = coilPoint(i / pieces);
        const p2 = coilPoint((i + 1) / pieces);
        const middle = coilPoint((i + 0.5) / pieces);
        if (middle.front !== drawFront) continue;    // skip pieces that belong to the other pass
        add('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: drawFront ? 'coil-front' : 'coil-back' });
      }
    });

    /* the finish flag at the bottom of the spiral */
    const end = coilPoint(1);
    const flag = add('g', { class: 'flag', transform: 'translate(' + (end.x + 18) + ',' + (end.y + 2) + ')' });
    flag.innerHTML = '<line x1="0" y1="0" x2="0" y2="-34"/><path d="M0 -34 L22 -26 L0 -18 Z"/>';
  }

  /* ---------- Making the two formulas ---------- */

  /* makeRace: picks two distance formulas for the balls.
       one-term formula:  like 3t²          (uses the Constant Multiple + Power rules)
       two/three terms:   like t² + 5t + 4  (also uses Sum and Constant rules)
     The constant at the end (like + 4) is a head start in meters.
     We keep trying until the two speeds at 3 seconds differ by at least 2,
     so there is always a clear winner. */
  function makeRace() {
    for (;;) {
      const one = [{ c: ri(2, 4), p: 2 }];
      const two = [{ c: ri(1, 2), p: 2 }, { c: ri(2, 8), p: 1 }];
      if (Math.random() < 0.5) two.push({ c: ri(2, 9), p: 0 });      // sometimes add a head start
      const swap = Math.random() < 0.5;                               // randomly decide which ball gets which formula
      const A = swap ? two : one;
      const B = swap ? one : two;
      const gap = Math.abs(M.evalTerms(M.derive(A), T_END) - M.evalTerms(M.derive(B), T_END));
      if (gap >= 2) return { A: A, B: B };
    }
  }

  /* ---------- Moving the balls ---------- */

  /* place(who, t): put ball A or B where it should be at time t.
     1. M.evalTerms(formula, t) = how far the ball has rolled (the distance s).
     2. Divide by race.scale to get a fraction f from 0 to 1 of the way down.
     3. Turn that fraction into a spot on the slide (straight line or spiral). */
  function place(who, t) {
    const f = Math.min(1, M.evalTerms(race[who], t) / race.scale);
    let x, y;
    if (who === 'A') {                                  // straight slide: move along the line
      x = SLIDE_A.x0 + (SLIDE_A.x1 - SLIDE_A.x0) * f;
      y = SLIDE_A.y0 + (SLIDE_A.y1 - SLIDE_A.y0) * f - 18;   // -18 lifts the ball on top of the slide
    } else {                                            // spiral slide: follow the coil
      const p = coilPoint(f);
      x = p.x; y = p.y - 18;
    }
    $('ball-' + who.toLowerCase()).setAttribute('transform', 'translate(' + x + ',' + y + ')');
  }

  /* update(t): move both balls and refresh the time and speed numbers.
     The speed shown is the DERIVATIVE of the distance formula, found with M.derive(). */
  function update(t) {
    place('A', t);
    place('B', t);
    $('h-t').textContent = t.toFixed(1);
    $('h-va').textContent = M.evalTerms(M.derive(race.A), t).toFixed(1);
    $('h-vb').textContent = M.evalTerms(M.derive(race.B), t).toFixed(1);
  }

  function setMsg(text, warn) {         // the small message line under the buttons
    $('msg').textContent = text;
    $('msg').classList.toggle('warn', !!warn);
  }

  /* ---------- Race buttons ---------- */

  /* newRace: reset everything and make two brand new formulas */
  function newRace() {
    cancelAnimationFrame(race.raf);
    race.running = false;
    const r = makeRace();
    race.A = r.A;
    race.B = r.B;
    race.pick = null;
    race.scale = Math.max(M.evalTerms(r.A, T_END), M.evalTerms(r.B, T_END)) * 1.08;   // a little extra room so no ball sits exactly on the end
    $('eq-a').textContent = 's = ' + M.eqText(r.A, 't');       // show the formulas on the page
    $('eq-b').textContent = 's = ' + M.eqText(r.B, 't');
    document.querySelectorAll('.pick').forEach((b) => { b.classList.remove('sel'); b.disabled = false; });
    $('start').disabled = false;
    $('result').classList.add('hidden');
    setMsg('Pick a ball, then press Start race.');
    update(0);                                                   // put both balls at the start
  }

  /* startRace: runs the animation.
     Time t goes from 0 to 3. We play it a bit slower than real life
     (x 0.75) so it takes about 4 real seconds and is easy to watch. */
  function startRace() {
    if (race.running) return;
    if (!race.pick) { setMsg('Pick which ball will be faster at 3 seconds first!', true); return; }
    race.running = true;
    $('start').disabled = true;
    document.querySelectorAll('.pick').forEach((b) => { b.disabled = true; });
    $('result').classList.add('hidden');
    setMsg('Racing…');
    const t0 = performance.now();
    (function frame(now) {                                       // this runs again and again, about 60 times a second
      const t = Math.min(T_END, ((now - t0) / 1000) * 0.75);
      update(t);
      if (t < T_END) race.raf = requestAnimationFrame(frame);    // not finished yet: draw the next frame
      else finishRace();                                         // reached 3 seconds: show the answer
    })(t0);
  }

  /* finishRace: shows who was faster and explains it with the rules */
  function finishRace() {
    race.running = false;

    const vA = M.evalTerms(M.derive(race.A), T_END);    // speed of A at 3 s (the derivative!)
    const vB = M.evalTerms(M.derive(race.B), T_END);    // speed of B at 3 s
    const sA = M.evalTerms(race.A, T_END);              // distance of A at 3 s
    const sB = M.evalTerms(race.B, T_END);              // distance of B at 3 s
    const winner = vA > vB ? 'A' : 'B';                 // faster = bigger speed
    const right = race.pick === winner;
    if (right) addPoints(10);

    /* column(): one box for one ball, showing its steps and its speed at 3 seconds */
    function column(who, terms, v) {
      const d = M.derive(terms);                        // the speed formula
      /* Build the "plug in t = 3" line, e.g. "2 × 3 + 3" */
      const calc = d.length ? d.map((t, i) => {
        const piece = t.p === 0 ? String(Math.abs(t.c)) : (Math.abs(t.c) === 1 ? '' : Math.abs(t.c) + ' × ') + T_END;
        return (i === 0 ? (t.c < 0 ? '−' : '') : (t.c < 0 ? ' − ' : ' + ')) + piece;
      }).join('') : '0';
      return '<div class="col ' + who.toLowerCase() + '"><h3>Ball ' + who + '</h3>' +
        '<div>Distance: <b class="step-result">s = ' + M.eqText(terms, 't') + '</b></div>' +
        stepsHtml(terms, 't') +
        '<div class="answer">Speed formula: <span class="step-result">v = ' + M.eqText(d, 't') + '</span><br>' +
        'At t = ' + T_END + ' s: <span class="step-result">v = ' + calc + ' = ' + v + ' m/s</span></div></div>';
    }

    /* A teaching moment: the ball that is farther ahead is not always the faster one.
       Distance and speed are different things. The derivative gives SPEED. */
    const farther = sA > sB ? 'A' : 'B';
    const note = farther !== winner
      ? '<div class="note">Ball ' + farther + ' has rolled farther (' + (farther === 'A' ? sA : sB) +
        ' m), but Ball ' + winner + ' is going faster right now. The derivative tells us <b>speed</b>, not distance.</div>'
      : '';

    $('result').innerHTML =
      '<p class="big">Ball ' + winner + ' is faster at 3 seconds!</p>' +
      '<p class="verdict ' + (right ? 'ok' : 'no') + '">' +
      (right ? 'Great prediction! +10 points' : 'Not this time. Look at how the rules give the answer.') + '</p>' +
      '<div class="cols">' + column('A', race.A, vA) + column('B', race.B, vB) + '</div>' + note;
    $('result').classList.remove('hidden');
    $('start').disabled = false;
    document.querySelectorAll('.pick').forEach((b) => { b.disabled = false; });
    setMsg('Press New race to try another one.');
  }

  /* Clicking "Ball A" or "Ball B" saves the student's prediction */
  document.querySelectorAll('.pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      race.pick = btn.dataset.pick;
      document.querySelectorAll('.pick').forEach((b) => b.classList.toggle('sel', b === btn));
      setMsg('You picked Ball ' + race.pick + '. Press Start race.');
    });
  });
  $('start').addEventListener('click', startRace);
  $('new-race').addEventListener('click', newRace);

  /* =====================================================================
     3. THE PRACTICE TAB
     Shows f(x) and 4 possible answers. Only one is the real derivative.
     ===================================================================== */

  /* GEN is a list of "problem makers". Each one builds a random formula.
     They are grouped by the rule they practice:
       p: 0 is a plain number, p: 1 is x, p: 2 is x², and so on.
       A negative c means subtraction. */
  const GEN = [
    () => [{ c: ri(2, 20), p: 0 }],                                   // Constant Rule:           7
    () => [{ c: ri(2, 9), p: 1 }],                                    // Constant Multiple Rule:  5x
    () => [{ c: ri(2, 9), p: 2 }],                                    //                          4x²
    () => [{ c: 1, p: ri(2, 5) }],                                    // Power Rule:              x³
    () => [{ c: 1, p: ri(2, 5) }],                                    //                          (listed twice so it shows up more often)
    () => [{ c: ri(2, 5), p: ri(2, 4) }],                             // Constant Multiple + Power: 3x⁴
    () => [{ c: ri(1, 4), p: 2 }, { c: ri(2, 9), p: 1 }],             // Sum Rule:                2x² + 5x
    () => [{ c: 1, p: 3 }, { c: ri(1, 4), p: 2 }],                    //                          x³ + 3x²
    () => [{ c: ri(1, 4), p: 2 }, { c: -ri(2, 9), p: 1 }],            // Difference Rule:         3x² − 4x
    () => [{ c: 1, p: ri(3, 4) }, { c: -ri(1, 5), p: 2 }],            //                          x⁴ − 2x²
    () => [{ c: ri(1, 3), p: 2 }, { c: ri(2, 6), p: 1 }, { c: ri(2, 9), p: 0 }]   // all together: 2x² + 5x + 8
  ];

  /* wrongAnswers: makes 3 wrong choices that look like REAL student mistakes.
     That way a wrong answer teaches something about what went wrong. */
  function wrongAnswers(terms, correct) {
    const text = (t) => M.eqText(t, 'x');
    const moving = terms.filter((t) => t.p > 0);       // the terms that are not plain numbers
    let candidates;

    if (!moving.length) {
      /* The formula is just a number. Common mistakes: keep the number,
         say 1, or turn it into something with x. */
      candidates = [text(terms), '1', text([{ c: terms[0].c, p: 1 }])];
    } else {
      candidates = [
        text(moving.map((t) => ({ c: t.c * t.p, p: t.p }))),                       // mistake: multiplied but forgot minus 1 on the exponent
        text(moving.map((t) => ({ c: t.c, p: t.p - 1 }))),                         // mistake: minus 1 on the exponent but forgot to multiply
        text(terms.map((t) => (t.p === 0 ? t : { c: t.c * t.p, p: t.p - 1 }))),    // mistake: kept the plain number instead of making it 0
        text(terms)                                                                 // mistake: did nothing at all
      ];
    }

    /* Keep only different answers, and never include the right one */
    const out = [];
    shuffle(candidates).forEach((s) => { if (s !== correct && out.indexOf(s) < 0) out.push(s); });

    /* If we still need more choices, make small changes to the right answer */
    const d = M.derive(terms);
    [1, -1, 2, -2, 3].forEach((k) => {
      if (out.length >= 3 || !d.length) return;
      const copy = d.map((t) => ({ c: t.c, p: t.p }));
      copy[0].c += k;
      if (copy[0].c === 0) return;
      const s = text(copy);
      if (s !== correct && out.indexOf(s) < 0) out.push(s);
    });
    return out.slice(0, 3);
  }

  let prob = null;   // the question being shown right now

  /* newProblem: pick a random formula, find the real answer with M.derive(),
     mix it in with the 3 wrong answers, and show the 4 buttons */
  function newProblem() {
    const terms = GEN[ri(0, GEN.length - 1)]();
    const correct = M.eqText(M.derive(terms), 'x');
    prob = { terms: terms, correct: correct, done: false };
    const options = shuffle([correct].concat(wrongAnswers(terms, correct)));
    $('p-fx').textContent = 'f(x) = ' + M.eqText(terms, 'x');
    $('p-options').innerHTML = options.map((o) => '<button class="opt" data-v="' + o + '">' + o + '</button>').join('');
    $('p-feedback').textContent = '';
    $('p-feedback').className = 'feedback';
    $('p-solution').innerHTML = '';
    $('p-next').classList.add('hidden');
  }

  /* When the student clicks an answer:
     - lock all the buttons (one try only)
     - color the right answer green and a wrong pick red
     - give 10 points if correct
     - show the steps so they can see which rules were used */
  $('p-options').addEventListener('click', (e) => {
    const btn = e.target.closest('.opt');
    if (!btn || prob.done) return;
    prob.done = true;
    const right = btn.dataset.v === prob.correct;
    document.querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.v === prob.correct) b.classList.add('right');
      else if (b === btn) b.classList.add('wrong');
    });
    if (right) addPoints(10);
    $('p-feedback').textContent = right ? 'Correct! +10 points' : 'Not quite. The answer is ' + prob.correct + '.';
    $('p-feedback').className = 'feedback ' + (right ? 'ok' : 'no');
    $('p-solution').innerHTML = '<h2>How the rules work here</h2>' + stepsHtml(prob.terms, 'x') +
      '<div class="answer">f′(x) = <span class="step-result">' + prob.correct + '</span></div>';
    $('p-next').classList.remove('hidden');
  });
  $('p-next').addEventListener('click', newProblem);

  /* =====================================================================
     START THE GAME
     When the page opens: draw the spiral, set up the first race
     and show the first practice question.
     ===================================================================== */
  drawCoil();
  newRace();
  newProblem();
})();
