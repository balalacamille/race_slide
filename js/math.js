/* =====================================================================
   js/math.js  -  THE CALCULUS PART
   This is the only file that does derivatives. Everything else in the
   game (the race, the practice questions) just calls the functions here.

   HOW WE STORE A FORMULA
   Every formula is a list of "terms" (the pieces joined by + and −).
   Each term has two numbers:
       c = the number in front        p = the exponent
   Example:  3x² + 5x + 2  is stored as
       [ {c:3, p:2},  {c:5, p:1},  {c:2, p:0} ]
   (A plain number like 2 is treated as 2x⁰, so its exponent is 0.)

   THE 4 RULES USED
     1. Constant Rule           a plain number becomes 0
     2. Power Rule              bring the exponent down in front, then minus 1 on the exponent
     3. Constant Multiple Rule  multiply the exponent by the number in front, then minus 1 on the exponent
     4. Sum/Difference Rule     do each piece by itself, keep the + and − signs
   ===================================================================== */
(function (root) {
  'use strict';

  /* Small raised numbers so we can print exponents nicely: x² x³ x⁴ x⁵ */
  const SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };

  /* ---------------------------------------------------------------
     pieceText: turns ONE term into text.
     Example: c=3, p=2, v='x'  ->  "3x²"
     - exponent 0  -> just the number          (5)
     - number is 1 -> we don't write the 1     (x², not 1x²)
     - exponent 1  -> we don't write the 1     (3x, not 3x¹)
     (c is always positive here. The + or − sign is added in eqText.)
     --------------------------------------------------------------- */
  function pieceText(c, p, v) {
    if (p === 0) return String(c);
    return (c === 1 ? '' : String(c)) + v + (p > 1 ? SUP[p] : '');
  }

  /* ---------------------------------------------------------------
     eqText: turns a WHOLE formula (a list of terms) into text.
     Example: [{c:3,p:2},{c:-5,p:1}]  ->  "3x² − 5x"
     A negative number in front is how we show subtraction.
     An empty list means the answer is 0.
     --------------------------------------------------------------- */
  function eqText(terms, v) {
    if (!terms.length) return '0';
    return terms.map(function (t, i) {
      const body = pieceText(Math.abs(t.c), t.p, v);
      if (i === 0) return (t.c < 0 ? '−' : '') + body;   // first piece: only show a minus if needed
      return (t.c < 0 ? ' − ' : ' + ') + body;           // other pieces: put + or − between them
    }).join('');
  }

  /* ---------------------------------------------------------------
     derive: finds the derivative. THIS is where the rules happen.

     Sum/Difference Rule  -> we go through the terms one at a time.
     Constant Rule        -> a term with exponent 0 (a plain number)
                             is removed, because its derivative is 0.
     Power Rule and       -> every other term: multiply the exponent by
     Constant Multiple       the number in front (c × p), and put
                             minus 1 on the exponent (p − 1).
     Example: 4x²  ->  c = 4×2 = 8,  p = 2−1 = 1   ->  8x
     --------------------------------------------------------------- */
  function derive(terms) {
    return terms
      .filter(function (t) { return t.p > 0; })              // Constant Rule: drop plain numbers
      .map(function (t) { return { c: t.c * t.p, p: t.p - 1 }; });  // Power / Constant Multiple Rule
  }

  /* ---------------------------------------------------------------
     evalTerms: plugs a number into a formula and gives the answer.
     Example: the formula 2t + 3 with t = 3  ->  2×3 + 3 = 9
     We use it to find distance (s) and speed (v) at a given time.
     --------------------------------------------------------------- */
  function evalTerms(terms, x) {
    return terms.reduce(function (sum, t) { return sum + t.c * Math.pow(x, t.p); }, 0);
  }

  /* ---------------------------------------------------------------
     steps: builds the "how we did it" explanation.
     It returns one step for each term, saying which rule was used
     and showing the arithmetic. If there is more than one term, it adds
     a last step that puts the pieces back together (Sum/Difference Rule).
     Each step has:
        piece  - the term we started with        (3x²)
        rules  - which rule badges to show
        text   - the sentence explaining it
        result - what the term turned into       (6x)
     --------------------------------------------------------------- */
  function steps(terms, v) {
    const out = [];
    terms.forEach(function (t) {
      const a = Math.abs(t.c);               // the number in front (without its sign)
      const p = t.p;                         // the exponent
      const sign = t.c < 0 ? '−' : '';       // remember if this piece was subtracted
      const piece = pieceText(a, p, v);
      const s = { piece: sign + piece, rules: [], text: '', result: '' };

      if (p === 0) {
        /* CONSTANT RULE: a plain number never changes, so its derivative is 0 */
        s.rules = ['constant'];
        s.text = a + ' is just a number. It never changes, so its derivative is 0.';
        s.result = '0';

      } else if (p === 1) {
        if (a === 1) {
          /* POWER RULE on plain x (x is the same as x¹) */
          s.rules = ['power'];
          s.text = v + ' is ' + v + '¹. Bring the exponent 1 down in front, then minus 1 on the exponent: 1 − 1 = 0. ' +
            v + '⁰ = 1, so the answer is 1.';
          s.result = sign + '1';
        } else {
          /* CONSTANT MULTIPLE RULE on something like 5x: the exponent is 1, so 5 × 1 = 5 */
          s.rules = ['multiple', 'power'];
          s.text = 'The exponent of ' + v + ' is 1. Multiply it by the number in front: ' + a + ' × 1 = ' + a +
            '. Then minus 1 on the exponent: 1 − 1 = 0, so ' + v + ' disappears.';
          s.result = sign + a;
        }

      } else if (a === 1) {
        /* POWER RULE on something like x³: bring the exponent down, then minus 1 */
        s.rules = ['power'];
        s.text = 'Bring the exponent ' + p + ' down in front. Then minus 1 on the exponent: ' + p + ' − 1 = ' + (p - 1) + '.';
        s.result = sign + pieceText(p, p - 1, v);

      } else {
        /* CONSTANT MULTIPLE RULE on something like 4x²: number × exponent, then minus 1 on the exponent */
        s.rules = ['multiple', 'power'];
        s.text = 'Multiply the exponent ' + p + ' by the number in front: ' + a + ' × ' + p + ' = ' + (a * p) +
          '. Then minus 1 on the exponent: ' + p + ' − 1 = ' + (p - 1) + '.';
        s.result = sign + pieceText(a * p, p - 1, v);
      }
      out.push(s);
    });

    /* SUM/DIFFERENCE RULE: with more than one term, show the final "put it together" step */
    if (terms.length > 1) {
      out.push({
        piece: 'Put it together', rules: ['sum'],
        text: 'Do each piece by itself, then keep the same + and − signs.',
        result: eqText(derive(terms), v)
      });
    }
    return out;
  }

  /* Share these functions with app.js (it reads them from window.SlideMath) */
  const api = { SUP, pieceText, eqText, derive, evalTerms, steps };
  root.SlideMath = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // lets us test in Node too
})(typeof window !== 'undefined' ? window : globalThis);
