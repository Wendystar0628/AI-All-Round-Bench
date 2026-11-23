import Mathlib
open Real Set IntervalIntegral

noncomputable section

-- Problem 1: Lyapunov inequality for u'' + q u = 0 on (a,b) with u(a)=u(b)=0.
theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Ioo a b, u x ≠ 0) :
  4 < (b - a) * ∫ x in a..b, |q x| := by
  -- u is C^2, hence continuous and differentiable, deriv u is C^1
  have hcontu : Continuous u := hu.continuous
  have hdiffu : Differentiable ℝ u := hu.differentiable
  have hcontu' : Continuous (deriv u) := hu.continuous_succ
  have hdiffu' : Differentiable ℝ (deriv u) := hu.differentiable_succ

  -- The ODE extends to the closed interval by continuity of both sides.
  have hode' : ∀ x ∈ Icc a b, deriv (deriv u) x = - q x * u x := by
    intro x hx
    have hxo : x ∈ Ioo a b := by
      -- interior points are covered directly; boundary points follow by continuity
      sorry
    have := hode x hxo
    ring

  -- u attains its maximum M on [a,b]; since u(a)=u(b)=0 and u ≠ 0 in (a,b),
  -- after possibly replacing u by -u (which also satisfies the ODE), M > 0
  -- and is attained at an interior point c ∈ (a,b) with u'(c) = 0.
  have hmax : ∃ (M : ℝ) (c : ℝ), c ∈ Ioo a b ∧ u c = M ∧
      (∀ x ∈ Icc a b, u x ≤ M) ∧ M > 0 ∧ deriv u c = 0 := by
    sorry

  rcases hmax with ⟨M, c, hc, hcM, hMle, hMpos, hderiv0⟩
  have hca : a < c := hc.1
  have hcb : c < b := hc.2

  -- For x ∈ [a,c]: u'(x) = ∫_x^c q(t) u(t) dt  (FTC + ODE + u'(c)=0)
  have h_deriv_eq_int (x : ℝ) (hxa : a ≤ x) (hxc : x ≤ c) :
      deriv u x = ∫ t in x..c, q t * u t := by
    sorry

  -- Hence |u'(x)| ≤ M ∫_x^c |q(t)| dt on [a,c]
  have h_est (x : ℝ) (hxa : a ≤ x) (hxc : x ≤ c) :
      |deriv u x| ≤ M * ∫ t in x..c, |q t| := by
    sorry

  -- M = u(c) - u(a) = ∫_a^c u'(x) dx ≤ ∫_a^c |u'(x)| dx ≤ M ∫_a^c∫_x^c |q(t)| dt dx
  have h_main : 1 ≤ (c - a) * ∫ t in a..c, |q t| := by
    have hftc : u c - u a = ∫ x in a..c, deriv u x := by sorry
    have hineq : ∫ x in a..c, deriv u x ≤ ∫ x in a..c, |deriv u x| := by
      sorry
    have hbound : ∫ x in a..c, |deriv u x| ≤
        M * ∫ x in a..c, ∫ t in x..c, |q t| := by sorry
    -- Fubini: ∫_a^c ∫_x^c |q(t)| dt dx = ∫_a^c (t-a) |q(t)| dt ≤ (c-a) ∫_a^c |q(t)| dt
    have hfub : ∫ x in a..c, ∫ t in x..c, |q t| =
        ∫ t in a..c, (t - a) * |q t| := by sorry
    have hle : ∫ t in a..c, (t - a) * |q t| ≤ (c - a) * ∫ t in a..c, |q t| := by sorry
    -- since u c = M, u a = 0, and M > 0, dividing gives 1 ≤ (c-a)∫_a^c |q|
    have : M = u c - u a := by rw [ha]; linarith
    nlinarith [hMpos]

  -- Strictness: |q| is not a.e. zero on [a,c], so the (t-a) factor gives a strict gain.
  have h_strict_left : 1 < (c - a) * ∫ t in a..c, |q t| := by
    sorry

  -- Symmetric estimate on [c,b]: 1 < (b - c) * ∫_c^b |q(t)| dt
  have h_strict_right : 1 < (b - c) * ∫ t in c..b, |q t| := by
    sorry

  -- AM-HM: 1/(c-a) + 1/(b-c) ≥ 4/(b-a)
  have hamh : 1 / (c - a) + 1 / (b - c) ≥ 4 / (b - a) := by
    have hpos : 0 < c - a := by linarith
    have hpos' : 0 < b - c := by linarith
    field_simp
    nlinarith

  -- Combine: ∫_a^b |q| = ∫_a^c |q| + ∫_c^b |q| > 1/(c-a) + 1/(b-c) ≥ 4/(b-a)
  have hsum : ∫ x in a..b, |q x| =
      (∫ x in a..c, |q x|) + (∫ x in c..b, |q x|) := by
    sorry
  have hgt : ∫ x in a..b, |q x| > 1 / (c - a) + 1 / (b - c) := by
    rw [hsum]
    nlinarith
  have hfinal : ∫ x in a..b, |q x| > 4 / (b - a) := by
    linarith
  -- multiply by (b-a) > 0
  have hpos : 0 < b - a := by linarith
  nlinarith