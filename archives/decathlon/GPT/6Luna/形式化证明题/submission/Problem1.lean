import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.Analysis.Calculus.ContDiff.Basic
import Mathlib.Analysis.Calculus.ContDiff.Deriv

lemma problem1_green_identity {u : ℝ → ℝ} {a c b : ℝ}
    (hab : a < b) (hac : a < c) (hcb : c < b)
    (hu : ContDiff ℝ 2 u) (ha : u a = 0) (hb : u b = 0) :
    u c * (b - a) =
      -((c - a) * ∫ t in c..b, (b - t) * deriv (deriv u) t) +
      -((b - c) * ∫ t in a..c, (t - a) * deriv (deriv u) t) := by
  have hdu : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hcont1 : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hcont2 : Continuous (deriv (deriv u)) := (hu.deriv').continuous_deriv_one
  have hftca : ∫ t in a..c, deriv u t = u c - u a := by
    exact intervalIntegral.integral_deriv_eq_sub
      (fun t ht => (hu.differentiable (by norm_num)).differentiableAt)
      hcont1.continuousOn.intervalIntegrable
  have hftcb : ∫ t in c..b, deriv u t = u b - u c := by
    exact intervalIntegral.integral_deriv_eq_sub
      (fun t ht => (hu.differentiable (by norm_num)).differentiableAt)
      hcont1.continuousOn.intervalIntegrable
  have hleft : ∫ t in a..c, (t - a) * deriv (deriv u) t =
      (c - a) * deriv u c - (u c - u a) := by
    have h := intervalIntegral.integral_mul_deriv_eq_deriv_mul
      (u := fun t : ℝ => t - a) (u' := fun _ => (1 : ℝ))
      (v := deriv u) (v' := deriv (deriv u))
      (fun t ht => by simpa using (hasDerivAt_id t).sub_const a)
      (fun t ht => (hdu t).hasDerivAt)
      ((continuousOn_const : ContinuousOn (fun _ : ℝ => (1 : ℝ)) (Set.uIcc a c)).intervalIntegrable)
      hcont2.continuousOn.intervalIntegrable
    calc
      ∫ t in a..c, (t - a) * deriv (deriv u) t =
          (c - a) * deriv u c - (a - a) * deriv u a - ∫ t in a..c, deriv u t := by
        simpa only [one_mul] using h
      _ = (c - a) * deriv u c - (u c - u a) := by rw [hftca]; ring
  have hright : ∫ t in c..b, (b - t) * deriv (deriv u) t =
      - (b - c) * deriv u c + (u b - u c) := by
    have h := intervalIntegral.integral_mul_deriv_eq_deriv_mul
      (u := fun t : ℝ => b - t) (u' := fun _ => (-1 : ℝ))
      (v := deriv u) (v' := deriv (deriv u))
      (fun t ht => (hasDerivAt_id t).const_sub b)
      (fun t ht => (hdu t).hasDerivAt)
      ((continuousOn_const : ContinuousOn (fun _ : ℝ => (-1 : ℝ)) (Set.uIcc c b)).intervalIntegrable)
      hcont2.continuousOn.intervalIntegrable
    calc
      ∫ t in c..b, (b - t) * deriv (deriv u) t =
          (b - b) * deriv u b - (b - c) * deriv u c - ∫ t in c..b, -deriv u t := by
        simpa only [neg_one_mul] using h
      _ = -(b - c) * deriv u c + (u b - u c) := by
        rw [intervalIntegral.integral_neg, hftcb]
        ring
  rw [ha] at hleft
  rw [hb] at hright
  have h1 := congrArg (fun z : ℝ => (b - c) * z) hleft
  have h2 := congrArg (fun z : ℝ => (c - a) * z) hright
  have hsum : (b - c) * (∫ t in a..c, (t - a) * deriv (deriv u) t) +
      (c - a) * (∫ t in c..b, (b - t) * deriv (deriv u) t) =
        -((b - a) * u c) := by
    calc
      _ = (b - c) * ((c - a) * deriv u c - u c) +
          (c - a) * (-(b - c) * deriv u c - u c) := by
            have h12 := congrArg₂ (fun x y : ℝ => x + y) h1 h2
            simpa [sub_eq_add_neg] using h12
      _ = -((b - a) * u c) := by ring
  have hmain : u c * (b - a) =
      -((c - a) * (∫ t in c..b, (b - t) * deriv (deriv u) t)) +
      -((b - c) * (∫ t in a..c, (t - a) * deriv (deriv u) t)) := by
    simpa [mul_comm] using (congrArg Neg.neg hsum).symm
  exact hmain

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  let φ : ℝ → ℝ := fun x => |u x|
  have hφ : ContinuousOn φ (Set.Icc a b) := hu.continuous.continuousOn.abs
  obtain ⟨c, hc, hmax⟩ := isCompact_Icc.exists_isMaxOn (Set.nonempty_Icc.mpr hab.le) hφ
  obtain ⟨x, hx, hxne⟩ := hne
  have hxI : x ∈ Set.Icc a b := Set.Ioo_subset_Icc_self hx
  have hpos : 0 < φ c := lt_of_lt_of_le (abs_pos.mpr hxne) (hmax hxI)
  have hca : a < c := by
    by_contra hnot
    have hcEq : c = a := le_antisymm (not_lt.mp hnot) hc.1
    subst c
    simpa [φ, ha] using hpos
  have hcb : c < b := by
    by_contra hnot
    have hcEq : c = b := le_antisymm hc.2 (not_lt.mp hnot)
    subst c
    simpa [φ, hb] using hpos
  have hgreen := problem1_green_identity hab hca hcb hu ha hb
  have hqprod : ∃ t, (t ∈ Set.Ioo a c ∨ t ∈ Set.Ioo c b) ∧ q t * u t ≠ 0 := by
    by_contra hn
    have hzero : ∀ t, (t ∈ Set.Ioo a c ∨ t ∈ Set.Ioo c b) → q t * u t = 0 := by
      intro t ht
      by_contra hz
      exact hn ⟨t, ht, hz⟩
    have hleftEq : (Set.Ioo a c).EqOn
        (fun t => (t - a) * deriv (deriv u) t) (fun _ => 0) := by
      intro t ht
      have ht' : t ∈ Set.Ioo a b := ⟨ht.1, ht.2.trans hcb⟩
      have hode' := hode t ht'
      have hqu := hzero t (Or.inl ht)
      have hu'' : deriv (deriv u) t = -(q t * u t) := by linarith
      simp [hu'', hqu]
    have hrightEq : (Set.Ioo c b).EqOn
        (fun t => (b - t) * deriv (deriv u) t) (fun _ => 0) := by
      intro t ht
      have ht' : t ∈ Set.Ioo a b := ⟨hca.trans ht.1, ht.2⟩
      have hode' := hode t ht'
      have hqu := hzero t (Or.inr ht)
      have hu'' : deriv (deriv u) t = -(q t * u t) := by linarith
      simp [hu'', hqu]
    have hleft0 : ∫ t in a..c, (t - a) * deriv (deriv u) t = 0 := by
      rw [intervalIntegral.integral_congr_Ioo_of_le hca.le hleftEq]
      simp
    have hright0 : ∫ t in c..b, (b - t) * deriv (deriv u) t = 0 := by
      rw [intervalIntegral.integral_congr_Ioo_of_le hcb.le hrightEq]
      simp
    have huc0 : u c * (b - a) = 0 := by simpa [hleft0, hright0] using hgreen
    have hucne : u c ≠ 0 := by
      intro h
      simp [φ, h] at hpos
    have hlen0 : b - a = 0 := (mul_eq_zero.mp huc0).resolve_left hucne
    exact (sub_ne_zero.mpr hab.ne.symm) hlen0
  obtain ⟨t, ht, hqtune⟩ := hqprod
  have hqne : q t ≠ 0 := (mul_ne_zero_iff.mp hqtune).1
  have htu : u t ≠ 0 := (mul_ne_zero_iff.mp hqtune).2
  have hleftODEEq : (Set.Ioo a c).EqOn
      (fun x => (x - a) * deriv (deriv u) x)
      (fun x => -((x - a) * (q x * u x))) := by
    intro x hx
    have hx' : x ∈ Set.Ioo a b := ⟨hx.1, hx.2.trans hcb⟩
    have ho := hode x hx'
    have hu'' : deriv (deriv u) x = -(q x * u x) := by linarith
    change (x - a) * deriv (deriv u) x = -((x - a) * (q x * u x))
    rw [hu'']
    ring
  have hrightODEEq : (Set.Ioo c b).EqOn
      (fun x => (b - x) * deriv (deriv u) x)
      (fun x => -((b - x) * (q x * u x))) := by
    intro x hx
    have hx' : x ∈ Set.Ioo a b := ⟨hca.trans hx.1, hx.2⟩
    have ho := hode x hx'
    have hu'' : deriv (deriv u) x = -(q x * u x) := by linarith
    change (b - x) * deriv (deriv u) x = -((b - x) * (q x * u x))
    rw [hu'']
    ring
  have hleftODE : (∫ x in a..c, (x - a) * deriv (deriv u) x) =
      -(∫ x in a..c, (x - a) * (q x * u x)) := by
    rw [intervalIntegral.integral_congr_Ioo_of_le hca.le hleftODEEq,
      intervalIntegral.integral_neg]
  have hrightODE : (∫ x in c..b, (b - x) * deriv (deriv u) x) =
      -(∫ x in c..b, (b - x) * (q x * u x)) := by
    rw [intervalIntegral.integral_congr_Ioo_of_le hcb.le hrightODEEq,
      intervalIntegral.integral_neg]
  have hcore : u c * (b - a) =
      (b - c) * (∫ x in a..c, (x - a) * (q x * u x)) +
      (c - a) * (∫ x in c..b, (b - x) * (q x * u x)) := by
    rw [hleftODE, hrightODE] at hgreen
    linear_combination hgreen
  let M : ℝ := |u c|
  have hM : 0 < M := by
    dsimp [M]
    simpa [φ] using hpos
  have hlen : 0 < b - a := sub_pos.mpr hab
  have huBound : ∀ x ∈ Set.Icc a b, |u x| ≤ M := by
    intro x hx
    dsimp [M]
    simpa [φ] using hmax hx
  have hqac : ContinuousOn q (Set.Icc a c) := hq.mono (by
    intro x hx
    exact ⟨hx.1, hx.2.trans hcb.le⟩)
  have hqcb : ContinuousOn q (Set.Icc c b) := hq.mono (by
    intro x hx
    exact ⟨hca.le.trans hx.1, hx.2⟩)
  have huac : ContinuousOn u (Set.Icc a c) :=
    hu.continuous.continuousOn.mono (Set.subset_univ _)
  have hucb : ContinuousOn u (Set.Icc c b) :=
    hu.continuous.continuousOn.mono (Set.subset_univ _)
  have hleftAbsCont : ContinuousOn
      (fun x => |(x - a) * (q x * u x)|) (Set.Icc a c) := by
    exact ((continuousOn_id.sub continuousOn_const).mul (hqac.mul huac)).abs
  have hleftQCont : ContinuousOn
      (fun x => M * ((x - a) * |q x|)) (Set.Icc a c) := by
    exact continuousOn_const.mul ((continuousOn_id.sub continuousOn_const).mul hqac.abs)
  have hrightAbsCont : ContinuousOn
      (fun x => |(b - x) * (q x * u x)|) (Set.Icc c b) := by
    exact ((continuousOn_const.sub continuousOn_id).mul (hqcb.mul hucb)).abs
  have hrightQCont : ContinuousOn
      (fun x => M * ((b - x) * |q x|)) (Set.Icc c b) := by
    exact continuousOn_const.mul ((continuousOn_const.sub continuousOn_id).mul hqcb.abs)
  have hleftPoint : ∀ x ∈ Set.Icc a c,
      |(x - a) * (q x * u x)| ≤ M * ((x - a) * |q x|) := by
    intro x hx
    have hxnon : 0 ≤ x - a := sub_nonneg.mpr hx.1
    have hux := huBound x ⟨hx.1, hx.2.trans hcb.le⟩
    calc
      |(x - a) * (q x * u x)| = (x - a) * |q x| * |u x| := by
        rw [abs_mul, abs_mul, abs_of_nonneg hxnon]
        ring
      _ ≤ (x - a) * |q x| * M :=
        mul_le_mul_of_nonneg_left hux (by positivity)
      _ = M * ((x - a) * |q x|) := by ring
  have hrightPoint : ∀ x ∈ Set.Icc c b,
      |(b - x) * (q x * u x)| ≤ M * ((b - x) * |q x|) := by
    intro x hx
    have hxnon : 0 ≤ b - x := sub_nonneg.mpr hx.2
    have hux := huBound x ⟨hca.le.trans hx.1, hx.2⟩
    calc
      |(b - x) * (q x * u x)| = (b - x) * |q x| * |u x| := by
        rw [abs_mul, abs_mul, abs_of_nonneg hxnon]
        ring
      _ ≤ (b - x) * |q x| * M :=
        mul_le_mul_of_nonneg_left hux (by positivity)
      _ = M * ((b - x) * |q x|) := by ring
  have hleftAbs :
      |∫ x in a..c, (x - a) * (q x * u x)| ≤
        M * (∫ x in a..c, (x - a) * |q x|) := by
    calc
      |∫ x in a..c, (x - a) * (q x * u x)| ≤
          ∫ x in a..c, |(x - a) * (q x * u x)| :=
        intervalIntegral.abs_integral_le_integral_abs hca.le
      _ ≤ ∫ x in a..c, M * ((x - a) * |q x|) :=
        intervalIntegral.integral_mono_on hca.le
          (hleftAbsCont.intervalIntegrable_of_Icc hca.le)
          (hleftQCont.intervalIntegrable_of_Icc hca.le) hleftPoint
      _ = M * (∫ x in a..c, (x - a) * |q x|) := by
        rw [intervalIntegral.integral_const_mul]
  have hrightAbs :
      |∫ x in c..b, (b - x) * (q x * u x)| ≤
        M * (∫ x in c..b, (b - x) * |q x|) := by
    calc
      |∫ x in c..b, (b - x) * (q x * u x)| ≤
          ∫ x in c..b, |(b - x) * (q x * u x)| :=
        intervalIntegral.abs_integral_le_integral_abs hcb.le
      _ ≤ ∫ x in c..b, M * ((b - x) * |q x|) :=
        intervalIntegral.integral_mono_on hcb.le
          (hrightAbsCont.intervalIntegrable_of_Icc hcb.le)
          (hrightQCont.intervalIntegrable_of_Icc hcb.le) hrightPoint
      _ = M * (∫ x in c..b, (b - x) * |q x|) := by
        rw [intervalIntegral.integral_const_mul]
  let A : ℝ := c - a
  let B : ℝ := b - c
  let C : ℝ := (b - a) ^ 2 / 4
  have hA : 0 < A := by dsimp [A]; linarith
  have hB : 0 < B := by dsimp [B]; linarith
  have hAB : A * B ≤ C := by
    dsimp [A, B, C]
    nlinarith [sq_nonneg ((c - a) - (b - c))]
  have hleftCoeff : ∀ x ∈ Set.Icc a c, B * (x - a) ≤ C := by
    intro x hx
    have hstep : B * (x - a) ≤ B * A := by
      apply mul_le_mul_of_nonneg_left _ hB.le
      dsimp [A]
      linarith [hx.2]
    exact hstep.trans (by nlinarith [hAB])
  have hrightCoeff : ∀ x ∈ Set.Icc c b, A * (b - x) ≤ C := by
    intro x hx
    have hstep : A * (b - x) ≤ A * B := by
      apply mul_le_mul_of_nonneg_left _ hA.le
      dsimp [B]
      linarith [hx.1]
    exact hstep.trans hAB
  have hleftFCont : ContinuousOn
      (fun x => B * ((x - a) * |q x|)) (Set.Icc a c) := by
    exact continuousOn_const.mul ((continuousOn_id.sub continuousOn_const).mul hqac.abs)
  have hleftGCont : ContinuousOn (fun x => C * |q x|) (Set.Icc a c) :=
    continuousOn_const.mul hqac.abs
  have hrightFCont : ContinuousOn
      (fun x => A * ((b - x) * |q x|)) (Set.Icc c b) := by
    exact continuousOn_const.mul ((continuousOn_const.sub continuousOn_id).mul hqcb.abs)
  have hrightGCont : ContinuousOn (fun x => C * |q x|) (Set.Icc c b) :=
    continuousOn_const.mul hqcb.abs
  have hleftCmp :
      (∫ x in a..c, B * ((x - a) * |q x|)) ≤
        ∫ x in a..c, C * |q x| := by
    apply intervalIntegral.integral_mono_on hca.le
    · exact hleftFCont.intervalIntegrable_of_Icc hca.le
    · exact hleftGCont.intervalIntegrable_of_Icc hca.le
    · intro x hx
      have hcoeff := hleftCoeff x hx
      calc
        B * ((x - a) * |q x|) = (B * (x - a)) * |q x| := by ring
        _ ≤ C * |q x| := mul_le_mul_of_nonneg_right hcoeff (abs_nonneg _)
  have hrightCmp :
      (∫ x in c..b, A * ((b - x) * |q x|)) ≤
        ∫ x in c..b, C * |q x| := by
    apply intervalIntegral.integral_mono_on hcb.le
    · exact hrightFCont.intervalIntegrable_of_Icc hcb.le
    · exact hrightGCont.intervalIntegrable_of_Icc hcb.le
    · intro x hx
      have hcoeff := hrightCoeff x hx
      calc
        A * ((b - x) * |q x|) = (A * (b - x)) * |q x| := by ring
        _ ≤ C * |q x| := mul_le_mul_of_nonneg_right hcoeff (abs_nonneg _)
  have hleftStrict : t ∈ Set.Ioo a c →
      (∫ x in a..c, B * ((x - a) * |q x|)) <
        ∫ x in a..c, C * |q x| := by
    intro htL
    apply intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt
      hca hleftFCont hleftGCont
    · intro x hx
      have hcoeff := hleftCoeff x ⟨hx.1.le, hx.2⟩
      calc
        B * ((x - a) * |q x|) = (B * (x - a)) * |q x| := by ring
        _ ≤ C * |q x| := mul_le_mul_of_nonneg_right hcoeff (abs_nonneg _)
    · refine ⟨t, ⟨htL.1.le, htL.2.le⟩, ?_⟩
      have htcoeff : B * (t - a) < C := by
        have hta : t - a < A := by dsimp [A]; linarith [htL.2]
        have hltAB : B * (t - a) < B * A := mul_lt_mul_of_pos_left hta hB
        exact hltAB.trans_le (by nlinarith [hAB])
      have hqtpos : 0 < |q t| := abs_pos.mpr hqne
      calc
        B * ((t - a) * |q t|) = (B * (t - a)) * |q t| := by ring
        _ < C * |q t| := mul_lt_mul_of_pos_right htcoeff hqtpos
  have hrightStrict : t ∈ Set.Ioo c b →
      (∫ x in c..b, A * ((b - x) * |q x|)) <
        ∫ x in c..b, C * |q x| := by
    intro htR
    apply intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt
      hcb hrightFCont hrightGCont
    · intro x hx
      have hcoeff := hrightCoeff x ⟨hx.1.le, hx.2⟩
      calc
        A * ((b - x) * |q x|) = (A * (b - x)) * |q x| := by ring
        _ ≤ C * |q x| := mul_le_mul_of_nonneg_right hcoeff (abs_nonneg _)
    · refine ⟨t, ⟨htR.1.le, htR.2.le⟩, ?_⟩
      have htb : b - t < B := by dsimp [B]; linarith [htR.1]
      have htcoeff : A * (b - t) < C := by
        have hltAB : A * (b - t) < A * B := mul_lt_mul_of_pos_left htb hA
        exact hltAB.trans_le hAB
      have hqtpos : 0 < |q t| := abs_pos.mpr hqne
      calc
        A * ((b - t) * |q t|) = (A * (b - t)) * |q t| := by ring
        _ < C * |q t| := mul_lt_mul_of_pos_right htcoeff hqtpos
  have hqsplit :
      (∫ x in a..c, |q x|) + (∫ x in c..b, |q x|) =
        ∫ x in a..b, |q x| :=
    intervalIntegral.integral_add_adjacent_intervals
      (hqac.abs.intervalIntegrable_of_Icc hca.le)
      (hqcb.abs.intervalIntegrable_of_Icc hcb.le)
  have hweighted :
      B * (∫ x in a..c, (x - a) * |q x|) +
      A * (∫ x in c..b, (b - x) * |q x|) <
        C * (∫ x in a..b, |q x|) := by
    have hL : t ∈ Set.Ioo a c →
        B * (∫ x in a..c, (x - a) * |q x|) < C * (∫ x in a..c, |q x|) := by
      intro htL
      simpa only [intervalIntegral.integral_const_mul] using hleftStrict htL
    have hR : t ∈ Set.Ioo c b →
        A * (∫ x in c..b, (b - x) * |q x|) < C * (∫ x in c..b, |q x|) := by
      intro htR
      simpa only [intervalIntegral.integral_const_mul] using hrightStrict htR
    have hLweak :
        B * (∫ x in a..c, (x - a) * |q x|) ≤ C * (∫ x in a..c, |q x|) := by
      simpa only [intervalIntegral.integral_const_mul] using hleftCmp
    have hRweak :
        A * (∫ x in c..b, (b - x) * |q x|) ≤ C * (∫ x in c..b, |q x|) := by
      simpa only [intervalIntegral.integral_const_mul] using hrightCmp
    rcases ht with htL | htR
    · calc
        _ < C * (∫ x in a..c, |q x|) + C * (∫ x in c..b, |q x|) :=
          add_lt_add_of_lt_of_le (hL htL) hRweak
        _ = C * (∫ x in a..b, |q x|) := by rw [← hqsplit]; ring
    · calc
        _ < C * (∫ x in a..c, |q x|) + C * (∫ x in c..b, |q x|) :=
          add_lt_add_of_le_of_lt hLweak (hR htR)
        _ = C * (∫ x in a..b, |q x|) := by rw [← hqsplit]; ring
  have hcoreAbs :
      M * (b - a) ≤
        (b - c) * |∫ x in a..c, (x - a) * (q x * u x)| +
        (c - a) * |∫ x in c..b, (b - x) * (q x * u x)| := by
    calc
      M * (b - a) = |u c * (b - a)| := by
        dsimp [M]
        rw [abs_mul, abs_of_nonneg hlen.le]
      _ = |(b - c) * (∫ x in a..c, (x - a) * (q x * u x)) +
            (c - a) * (∫ x in c..b, (b - x) * (q x * u x))| := by rw [hcore]
      _ ≤ |(b - c) * (∫ x in a..c, (x - a) * (q x * u x))| +
            |(c - a) * (∫ x in c..b, (b - x) * (q x * u x))| := abs_add_le _ _
      _ = (b - c) * |∫ x in a..c, (x - a) * (q x * u x)| +
            (c - a) * |∫ x in c..b, (b - x) * (q x * u x)| := by
        rw [abs_mul, abs_of_nonneg hB.le, abs_mul, abs_of_nonneg hA.le]
  have hbase : b - a ≤
      (b - c) * (∫ x in a..c, (x - a) * |q x|) +
      (c - a) * (∫ x in c..b, (b - x) * |q x|) := by
    have hcomp : M * (b - a) ≤ M *
        ((b - c) * (∫ x in a..c, (x - a) * |q x|) +
          (c - a) * (∫ x in c..b, (b - x) * |q x|)) := by
      calc
        M * (b - a) ≤ _ := hcoreAbs
        _ ≤ (b - c) * (M * (∫ x in a..c, (x - a) * |q x|)) +
            (c - a) * (M * (∫ x in c..b, (b - x) * |q x|)) := add_le_add
          (mul_le_mul_of_nonneg_left hleftAbs hB.le)
          (mul_le_mul_of_nonneg_left hrightAbs hA.le)
        _ = _ := by ring
    exact (mul_le_mul_iff_right₀ hM).mp (by simpa [mul_comm] using hcomp)
  have hfinal : b - a < ((b - a) ^ 2 / 4) * (∫ x in a..b, |q x|) :=
    lt_of_le_of_lt hbase (by simpa [A, B, C] using hweighted)
  have hlengthSq : 0 < b - a := hlen
  nlinarith [hfinal]
