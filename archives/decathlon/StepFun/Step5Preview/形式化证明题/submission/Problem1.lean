import Mathlib.Analysis.Calculus.ContDiff.Basic
import Mathlib.Analysis.Calculus.Deriv.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.MeasureTheory.Measure.Interval
import Mathlib.MeasureTheory.Measure.Lebesgue.Basic
import Mathlib.Topology.Order.OrderClosed

open MeasureTheory Set

/-! ### Auxiliary lemmas -/

/-- Two integrands that agree on the open interval have the same interval integral. -/
lemma integral_congr_Ioo {f g : ℝ → ℝ} {α β : ℝ} (hαβ : α < β)
    (hf : IntervalIntegrable f volume α β) (hg : IntervalIntegrable g volume α β)
    (h : ∀ s ∈ Set.Ioo α β, f s = g s) : ∫ s in α..β, f s = ∫ s in α..β, g s := by
  calc ∫ s in α..β, f s = ∫ s in Set.Ioc α β, f s :=
      (intervalIntegral.integral_of_le hαβ.le).symm
    _ = ∫ s in Set.Ioo α β, f s :=
      (MeasureTheory.setIntegral_congr_set
        (MeasureTheory.Ioo_ae_eq_Ioc' MeasureTheory.volume_singleton)).symm
    _ = ∫ s in Set.Ioo α β, g s := MeasureTheory.setIntegral_congr_fun measurableSet_Ioo h
    _ = ∫ s in Set.Ioc α β, g s := MeasureTheory.setIntegral_congr_set
      (MeasureTheory.Ioo_ae_eq_Ioc' MeasureTheory.volume_singleton)
    _ = ∫ s in α..β, g s := intervalIntegral.integral_of_le hαβ.le

/-- Splitting an integral of an affine weight. -/
lemma weight_split {g : ℝ → ℝ} {α β : ℝ} (hαβ : α ≤ β)
    (h1 : IntervalIntegrable (fun s => (s - α) * g s) volume α β)
    (h2 : IntervalIntegrable (fun s => (β - s) * g s) volume α β)
    (hg : IntervalIntegrable g volume α β) :
    ∫ s in α..β, (s - α) * g s + ∫ s in α..β, (β - s) * g s
      = (β - α) * ∫ s in α..β, g s := by
  rw [← intervalIntegral.integral_add h1 h2, ← intervalIntegral.integral_const_mul (β - α) g]
  congr 1
  funext s
  ring

/-- A nonnegative continuous function with vanishing integral on an interval is identically zero
on the whole interval. -/
lemma zero_of_zero_integral {g : ℝ → ℝ} {α β : ℝ} (hαβ : α < β)
    (hg : ContinuousOn g (Set.Icc α β)) (hpos : ∀ s ∈ Set.Icc α β, 0 ≤ g s)
    (hint : ∫ s in α..β, g s = 0) : ∀ s ∈ Set.Icc α β, g s = 0 := by
  intro s hs
  by_contra hne
  have hgs : 0 < g s := by
    rcases lt_or_ge (g s) 0 with h | h
    · exact absurd (hpos s hs) (by linarith)
    · exact (hpos s hs).lt_of_ne (fun heq => hne heq.symm)
  have hcont : ContinuousAt g s := hg.continuousAt (Icc_mem_nhds hs.1 hs.2)
  have hlt : ∀ᶠ y in 𝓝 s, g s / 2 < g y := by
    have h1 := hcont.eventually_mem (Set.Ioi_mem_nhds (by linarith : g s / 2 < g s))
    simpa using h1
  rw [Metric.eventually_nhds_iff] at hlt
  obtain ⟨ε, hε, hε'⟩ := hlt
  set s₁ := max α (s - ε) with hs₁def
  set s₂ := min β (s + ε) with hs₂def
  have hs1lt : s₁ < s₂ := by
    refine max_lt_min (by linarith) (by linarith) (by linarith) (by linarith)
  have hle1 : α ≤ s₁ := le_max_left _ _
  have hle2 : s₂ ≤ β := min_le_left _ _
  have hpos' : ∀ t ∈ Set.Icc s₁ s₂, 0 < g t := by
    intro t ht
    have hd : dist t s < ε := by
      rw [Real.dist_eq]
      have ha1 : |t - s| ≤ s - s₁ := by
        have hA : |t - s| ≤ max (t - α) (t - (s - ε)) := by
          apply abs_sub_le_of_abs_sub_le (abs_sub_le_of_abs_sub_le (le_max_left _ _)
            (le_max_right _ _))
        have hB : max (t - α) (t - (s - ε)) ≤ s - s₁ := by
          rw [hs₁def]
          calc max (t - α) (t - (s - ε)) = t - min α (s - ε) := by
                rw [max_sub_min]; ring_nf
            _ ≤ s - min α (s - ε) := by linarith
        linarith [hA, hB]
      have ha2 : |t - s| ≤ s₂ - s := by
        have hA : |t - s| ≤ max (β - t) ((s + ε) - t) := by
          apply abs_sub_le_of_abs_sub_le (abs_sub_le_of_abs_sub_le (le_max_left _ _)
            (le_max_right _ _))
        have hB : max (β - t) ((s + ε) - t) ≤ s₂ - s := by
          rw [hs₂def]
          calc max (β - t) ((s + ε) - t) = max β (s + ε) - t := by rw [max_sub_min]; ring_nf
            _ ≤ max β (s + ε) - s := by linarith
        linarith [hA, hB]
      linarith [ha1, ha2]
  have hgcont : ContinuousOn g (Set.Icc s₁ s₂) :=
    hg.mono (fun t ht => ⟨le_trans hle1 ht.1, le_trans ht.2 hle2⟩)
  have hgi : IntervalIntegrable g volume s₁ s₂ := hgcont.intervalIntegrable
  have hgib : IntervalIntegrable g volume α β := by
    have hc : ContinuousOn g (Set.uIcc α β) := by rw [Set.uIcc_of_le hαβ.le]; exact hg
    exact hc.intervalIntegrable
  have h1 : 0 < ∫ t in s₁..s₂, g t :=
    intervalIntegral.integral_pos hs1lt hgcont (fun t ht => (hpos' t ht).le) hpos'
  have h2 : ∫ t in s₁..s₂, g t ≤ ∫ t in α..β, g t := by
    refine intervalIntegral.integral_mono_interval hle1 hs1lt.le hle2 ?_ hgib
    exact ae_of_all _ (fun t ht => hpos t ⟨ht.1, le_of_lt ht.2⟩)
  linarith [hint]

/-- Key integral identity (integration by parts against the second derivative). -/
lemma lyapunov_key {v q w : ℝ → ℝ} {α β ε : ℝ} (hαβ : α < β)
    (hv : ContDiff ℝ 2 v) (hq : ContinuousOn q (Set.Icc α β))
    (hode : ∀ x ∈ Set.Ioo α β, deriv (deriv v) x + q x * v x = 0)
    (hwd : ∀ s ∈ Set.Ioo α β, HasDerivAt w ε s)
    (hwcont : ContinuousOn w (Set.uIcc α β)) :
    ∫ s in α..β, w s * (q s * v s)
      = w α * deriv v α - w β * deriv v β + ε * (v β - v α) := by
  have hv'cont : Continuous (deriv v) := hv.continuous_deriv (by norm_num)
  have hv''cont : Continuous (deriv (deriv v)) := (hv.deriv').continuous_deriv (by norm_num)
  have hi_wqv : IntervalIntegrable (fun s => w s * (q s * v s)) volume α β := by
    have hc : ContinuousOn (fun s => w s * (q s * v s)) (Set.uIcc α β) := by
      rw [Set.uIcc_of_le hαβ.le]
      exact hwcont.mul (hq.mul hv.continuous.continuousOn)
    exact hc.intervalIntegrable
  have hi_wv2 : IntervalIntegrable (fun s => w s * deriv (deriv v) s) volume α β := by
    have hc : ContinuousOn (fun s => w s * deriv (deriv v) s) (Set.uIcc α β) := by
      rw [Set.uIcc_of_le hαβ.le]
      exact hwcont.mul hv''cont.continuousOn
    exact hc.intervalIntegrable
  have hi_eps : IntervalIntegrable (fun s => ε * deriv v s) volume α β := by
    have hc : ContinuousOn (fun s => ε * deriv v s) (Set.uIcc α β) := by
      rw [Set.uIcc_of_le hαβ.le]
      exact continuousOn_const.mul hv'cont.continuousOn
    exact hc.intervalIntegrable
  have hzero : ∫ s in α..β, w s * (q s * v s + deriv (deriv v) s) = 0 := by
    rw [intervalIntegral.integral_of_le hαβ.le]
    rw [← MeasureTheory.setIntegral_congr_set
      (MeasureTheory.Ioo_ae_eq_Ioc' MeasureTheory.volume_singleton)]
    rw [MeasureTheory.setIntegral_congr_fun measurableSet_Ioo (fun s hs => ?_)]
    · simp
    · have h1 := hode s hs
      have h2 : q s * v s + deriv (deriv v) s = 0 := by linarith
      simp [h2]
  have hsplit : ∫ s in α..β, w s * (q s * v s + deriv (deriv v) s)
      = ∫ s in α..β, w s * (q s * v s) + ∫ s in α..β, w s * deriv (deriv v) s := by
    rw [show (fun s => w s * (q s * v s + deriv (deriv v) s))
        = (fun s => w s * (q s * v s)) + (fun s => w s * deriv (deriv v) s) from by
      funext s; ring]
    exact intervalIntegral.integral_add hi_wqv hi_wv2
  have hibp : ∫ s in α..β, w s * deriv (deriv v) s
      = w β * deriv v β - w α * deriv v α - ∫ s in α..β, ε * deriv v s := by
    refine intervalIntegral.integral_mul_deriv_eq_deriv_mul_of_hasDerivAt hwcont
      hv'cont.continuousOn (fun x hx => ?_) (fun x hx => ?_)
      (intervalIntegrable_const : IntervalIntegrable (fun _ => ε) volume α β)
      (hv''cont.intervalIntegrable)
    · exact hwd x (by
        rw [Set.min_eq_left hαβ.le, Set.max_eq_right hαβ.le] at hx; exact hx)
    · exact (hv.differentiable_deriv_two x).hasDerivAt
  have hibp2 : ∫ s in α..β, ε * deriv v s = ε * (v β - v α) := by
    rw [intervalIntegral.integral_const_mul ε (deriv v)]
    have h1 : ∫ s in α..β, deriv v s = v β - v α := by
      refine intervalIntegral.integral_deriv_eq_sub (fun x _ => (hv.differentiable (by norm_num)) x)
        ?_
      exact hv'cont.intervalIntegrable
    rw [h1]
  have hA : ∫ s in α..β, w s * (q s * v s)
      = -∫ s in α..β, w s * deriv (deriv v) s := by
    rw [hsplit] at hzero
    linarith
  calc ∫ s in α..β, w s * (q s * v s)
      = -∫ s in α..β, w s * deriv (deriv v) s := hA
    _ = -(w β * deriv v β - w α * deriv v α - ∫ s in α..β, ε * deriv v s) := by rw [hibp]
    _ = w α * deriv v α - w β * deriv v β + ε * (v β - v α) := by rw [hibp2]; ring

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hu_cont : Continuous u := hu.continuous
  have hu'cont : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hu''cont : Continuous (deriv (deriv u)) := (hu.deriv').continuous_deriv (by norm_num)
  have hu'diff : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have habs : ∀ (f : ℝ → ℝ) (s : Set ℝ), ContinuousOn f s → ContinuousOn (fun x => |f x|) s := by
    intro f s hf
    have h1 : ContinuousOn (fun x => ‖f x‖) s := hf.norm'
    have h2 : (fun x => |f x|) = (fun x => ‖f x‖) := funext fun x => (Real.norm_eq_abs (f x)).symm
    rw [h2]; exact h1
  obtain ⟨c, hcIcc, hcmax⟩ := (isCompact_Icc : IsCompact (Set.Icc a b)).exists_isMaxOn
    (by exact ⟨a, left_mem_Icc⟩) (habs u (Set.Icc a b) hu_cont.continuousOn)
  have hcio : c ∈ Set.Ioo a b := by
    have hac : a < c := by
      rcases lt_or_ge a c with h | h
      · exact h
      · exfalso
        have hca : c = a := le_antisymm h hcIcc.1
        subst hca
        obtain ⟨x, hx, hxu⟩ := hne
        have h1 := hcmax x (Set.mem_Icc_of_Ioo hx)
        rw [ha, abs_zero, abs_nonpos] at h1
        exact hxu h1
    have hcb : c < b := by
      rcases lt_or_ge c b with h | h
      · exact h
      · exfalso
        have hcb' : c = b := le_antisymm hcIcc.2 h
        subst hcb'
        obtain ⟨x, hx, hxu⟩ := hne
        have h1 := hcmax x (Set.mem_Icc_of_Ioo hx)
        rw [hb, abs_zero, abs_nonpos] at h1
        exact hxu h1
    exact ⟨hac, hcb⟩
  have hac : a < c := hcio.1
  have hcb : c < b := hcio.2
  have hucne : u c ≠ 0 := by
    intro h
    obtain ⟨x, hx, hxu⟩ := hne
    have h1 := hcmax x (Set.mem_Icc_of_Ioo hx)
    rw [h, abs_zero, abs_nonpos] at h1
    exact hxu h1
  have hlm : IsLocalMax (fun x => |u x|) c := hcmax.isLocalMax (Icc_mem_nhds hcIcc.1 hac)
  have hderc : deriv u c = 0 := by
    rcases lt_trichotomy (u c) 0 with hlt | heq | hgt
    · have hmin : IsLocalMin u c := by
        filter_upwards [hlm] with x hx
        have ha1 : -|u x| ≤ u x := neg_abs_le _
        have ha2 : |u c| = -u c := abs_of_neg hlt
        linarith
      exact hmin.deriv_eq_zero
    · exact absurd heq hucne
    · have hmax : IsLocalMax u c := by
        filter_upwards [hlm] with x hx
        have ha1 : u x ≤ |u x| := le_abs_self _
        have ha2 : |u c| = u c := abs_of_pos hgt
        linarith
      exact hmax.deriv_eq_zero
  have hub : ∀ s ∈ Set.Icc a b, |u s| ≤ |u c| := fun s hs => hcmax s hs
  -- integrability helpers
  have hIi : ∀ f : ℝ → ℝ, ContinuousOn f (Set.Icc a c) → IntervalIntegrable f volume a c := by
    intro f hf
    have hf' : ContinuousOn f (Set.uIcc a c) := by rw [Set.uIcc_of_le hac.le]; exact hf
    exact hf'.intervalIntegrable
  have hJi : ∀ f : ℝ → ℝ, ContinuousOn f (Set.Icc c b) → IntervalIntegrable f volume c b := by
    intro f hf
    have hf' : ContinuousOn f (Set.uIcc c b) := by rw [Set.uIcc_of_le hcb.le]; exact hf
    exact hf'.intervalIntegrable
  have hqc : ContinuousOn q (Set.Icc a c) := hq.mono (Set.Icc_subset_Icc le_rfl hcb.le)
  have hqcb : ContinuousOn q (Set.Icc c b) := hq.mono (Set.Icc_subset_Icc hac.le le_rfl)
  have hucc : ContinuousOn u (Set.Icc a c) := hu_cont.continuousOn
  have hucb : ContinuousOn u (Set.Icc c b) := hu_cont.continuousOn
  -- the two fundamental identities
  have key1 : ∫ s in a..c, (s - a) * (q s * u s) = u c := by
    have h : ∫ s in a..c, (s - a) * (q s * u s)
        = (a - a) * deriv u a - (c - a) * deriv u c + 1 * (u c - u a) :=
      lyapunov_key (v := u) (q := q) (w := fun s => s - a) (α := a) (β := c) (ε := (1 : ℝ))
        hac hu hq (fun x hx => hode x (Set.Ioo_subset_Ioo le_rfl hcb.le hx))
        (fun s hs => (hasDerivAt_id' s).sub_const a)
        ((continuous_id.sub continuous_const).continuousOn)
    rw [h, ha, hderc]
    simp
  have key2 : ∫ s in c..b, (b - s) * (q s * u s) = u c := by
    have h : ∫ s in c..b, (b - s) * (q s * u s)
        = (b - c) * deriv u c - (b - b) * deriv u b + (-1 : ℝ) * (u b - u c) :=
      lyapunov_key (v := u) (q := q) (w := fun s => b - s) (α := c) (β := b) (ε := (-1 : ℝ))
        hcb hu hq (fun x hx => hode x (Set.Ioo_subset_Ioo hac.le le_rfl hx))
        (fun s hs => (hasDerivAt_id' s).const_sub b)
        ((continuous_const.sub continuous_id).continuousOn)
    rw [h, hb, hderc]
    simp
  -- integrability of the pieces
  have hIAbs : IntervalIntegrable (fun s => |q s|) volume a c := hIi _ (habs q _ hqc)
  have hIAbs2 : IntervalIntegrable (fun s => |q s|) volume c b := hJi _ (habs q _ hqcb)
  have hIAbsAll : IntervalIntegrable (fun s => |q s|) volume a b := by
    have hc : ContinuousOn (fun s => |q s|) (Set.uIcc a b) := by
      rw [Set.uIcc_of_le hab.le]; exact habs q _ hq
    exact hc.intervalIntegrable
  have hW1c : ContinuousOn (fun s => (s - a) * |q s|) (Set.Icc a c) :=
    ((continuous_id.sub continuous_const).continuousOn).mul (habs q _ hqc)
  have hW2c : ContinuousOn (fun s => (b - s) * |q s|) (Set.Icc c b) :=
    ((continuous_const.sub continuous_id).continuousOn).mul (habs q _ hqcb)
  have hW1cc : ContinuousOn (fun s => (s - a) * |q s| * |u s|) (Set.Icc a c) :=
    hW1c.mul (habs u _ hucc)
  have hW2cc : ContinuousOn (fun s => (b - s) * |q s| * |u s|) (Set.Icc c b) :=
    hW2c.mul (habs u _ hucb)
  have hF1c : ContinuousOn (fun s => (s - a) * (q s * u s)) (Set.Icc a c) :=
    ((continuous_id.sub continuous_const).continuousOn).mul (hqc.mul hucc)
  have hF2c : ContinuousOn (fun s => (b - s) * (q s * u s)) (Set.Icc c b) :=
    ((continuous_const.sub continuous_id).continuousOn).mul (hqcb.mul hucb)
  have hIW1 : IntervalIntegrable (fun s => (s - a) * |q s| * |u s|) volume a c := hIi _ hW1cc
  have hIW2 : IntervalIntegrable (fun s => (b - s) * |q s| * |u s|) volume c b := hJi _ hW2cc
  have hIW1' : IntervalIntegrable (fun s => (s - a) * |q s|) volume a c := hIi _ hW1c
  have hIW2' : IntervalIntegrable (fun s => (b - s) * |q s|) volume c b := hJi _ hW2c
  have hIW1'' : IntervalIntegrable (fun s => (c - s) * |q s|) volume a c :=
    hIi _ (((continuous_const.sub continuous_id).continuousOn).mul (habs q _ hqc))
  have hIW2'' : IntervalIntegrable (fun s => (s - c) * |q s|) volume c b :=
    hJi _ (((continuous_id.sub continuous_const).continuousOn).mul (habs q _ hqcb))
  have hIF1 : IntervalIntegrable (fun s => (s - a) * (q s * u s)) volume a c := hIi _ hF1c
  have hIF2 : IntervalIntegrable (fun s => (b - s) * (q s * u s)) volume c b := hJi _ hF2c
  -- basic estimates
  have hub1 : ∫ s in a..c, (s - a) * |q s| * |u s| ≤ |u c| * ∫ s in a..c, (s - a) * |q s| := by
    refine intervalIntegral.integral_mono_on hac.le hIW1 hIW1' (fun s hs => ?_)
    have h1 : 0 ≤ s - a := by linarith [hs.1]
    have h2 : |u s| ≤ |u c| := hub s ⟨hs.1, hs.2.trans hac.le⟩
    have h3 : (0 : ℝ) ≤ |q s| := abs_nonneg _
    exact mul_le_mul_of_nonneg_left h2 (mul_nonneg h1 h3)
  have hub2 : ∫ s in c..b, (b - s) * |q s| * |u s| ≤ |u c| * ∫ s in c..b, (b - s) * |q s| := by
    refine intervalIntegral.integral_mono_on hcb.le hIW2 hIW2' (fun s hs => ?_)
    have h1 : 0 ≤ b - s := by linarith [hs.2]
    have h2 : |u s| ≤ |u c| := hub s ⟨hac.le.trans hs.1, hs.2⟩
    have h3 : (0 : ℝ) ≤ |q s| := abs_nonneg _
    exact mul_le_mul_of_nonneg_left h2 (mul_nonneg h1 h3)
  have hub1' : ∫ s in a..c, (s - a) * |q s| ≤ (c - a) * ∫ s in a..c, |q s| := by
    refine intervalIntegral.integral_mono_on hac.le hIW1' hIAbs (fun s hs => ?_)
    have h1 : (0 : ℝ) ≤ |q s| := abs_nonneg _
    have h2 : s - a ≤ c - a := by linarith [hs.1]
    exact mul_le_mul_of_nonneg_right h2 h1
  have hub2' : ∫ s in c..b, (b - s) * |q s| ≤ (b - c) * ∫ s in c..b, |q s| := by
    refine intervalIntegral.integral_mono_on hcb.le hIW2' hIAbs2 (fun s hs => ?_)
    have h1 : (0 : ℝ) ≤ |q s| := abs_nonneg _
    have h2 : b - s ≤ b - c := by linarith [hs.2]
    exact mul_le_mul_of_nonneg_left h2 h1
  have hsplitAbs : ∫ s in a..c, |q s| + ∫ s in c..b, |q s| = ∫ s in a..b, |q s| :=
    intervalIntegral.integral_add_adjacent_intervals hIAbs hIAbs2
  -- the chain of inequalities
  have cA : 2 * |u c|
      ≤ |u c| * (∫ s in a..c, (s - a) * |q s| * |u s| + ∫ s in c..b, (b - s) * |q s| * |u s|) := by
    have h1 : |∫ s in a..c, (s - a) * (q s * u s)| ≤ ∫ s in a..c, (s - a) * |q s| * |u s| := by
      have h := intervalIntegral.abs_integral_le_integral_abs hac.le
        (f := fun s => (s - a) * (q s * u s))
      refine le_trans h ?_
      refine intervalIntegral.integral_mono_on hac.le hIF1 hIW1 (fun s hs => ?_)
      have h3 : 0 ≤ s - a := by linarith [hs.1]
      rw [abs_mul, abs_mul, abs_of_nonneg h3]
      exact le_of_eq (by ring)
    have h2 : |∫ s in c..b, (b - s) * (q s * u s)| ≤ ∫ s in c..b, (b - s) * |q s| * |u s| := by
      have h := intervalIntegral.abs_integral_le_integral_abs hcb.le
        (f := fun s => (b - s) * (q s * u s))
      refine le_trans h ?_
      refine intervalIntegral.integral_mono_on hcb.le hIF2 hIW2 (fun s hs => ?_)
      have h3 : 0 ≤ b - s := by linarith [hs.2]
      rw [abs_mul, abs_mul, abs_of_nonneg h3]
      exact le_of_eq (by ring)
    calc 2 * |u c|
        = |∫ s in a..c, (s - a) * (q s * u s) + ∫ s in c..b, (b - s) * (q s * u s)| := by
          rw [key1, key2]; simp
      _ ≤ |∫ s in a..c, (s - a) * (q s * u s)| + |∫ s in c..b, (b - s) * (q s * u s)| :=
          abs_add_le _ _
      _ ≤ ∫ s in a..c, (s - a) * |q s| * |u s| + ∫ s in c..b, (b - s) * |q s| * |u s| :=
          add_le_add h1 h2
      _ = |u c| * ∫ s in a..c, (s - a) * |q s| + |u c| * ∫ s in c..b, (b - s) * |q s| := by
          rw [hub1, hub2]
      _ = |u c| * (∫ s in a..c, (s - a) * |q s| * |u s| + ∫ s in c..b, (b - s) * |q s| * |u s|) := by
          rw [hub1, hub2]; ring
  have cB : ∫ s in a..c, (s - a) * |q s| * |u s| + ∫ s in c..b, (b - s) * |q s| * |u s|
      ≤ |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|) := by
    rw [mul_add]
    exact add_le_add hub1 hub2
  have cC : |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|)
      ≤ |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|) :=
    mul_le_mul_of_nonneg_left (add_le_add hub1' hub2') (abs_nonneg _)
  have cD : |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|)
      ≤ |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := by
    have hca : c - a ≤ (b - a) / 2 := by linarith
    have hbc : b - c ≤ (b - a) / 2 := by linarith
    have hX : 0 ≤ ∫ s in a..c, |q s| := intervalIntegral.integral_nonneg hac.le
      (fun s _ => abs_nonneg _)
    have hY : 0 ≤ ∫ s in c..b, |q s| := intervalIntegral.integral_nonneg hcb.le
      (fun s _ => abs_nonneg _)
    calc |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|)
        ≤ |u c| * ((b - a) / 2 * ∫ s in a..c, |q s| + (b - a) / 2 * ∫ s in c..b, |q s|) := by
          refine mul_le_mul_of_nonneg_left ?_ (abs_nonneg _)
          refine add_le_add (mul_le_mul_of_nonneg_right hca hX)
            (mul_le_mul_of_nonneg_right hbc hY)
      _ = |u c| * ((b - a) / 2 * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|)) := by ring
  have hchain : 2 * |u c| ≤ |u c| * ((b - a) / 2) * ∫ s in a..b, |q s| := by
    calc 2 * |u c| ≤ |u c| * (∫ s in a..c, (s - a) * |q s| * |u s|
        + ∫ s in c..b, (b - s) * |q s| * |u s|) := cA
      _ ≤ |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|) := cB
      _ ≤ |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|) := cC
      _ ≤ |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := cD
      _ = |u c| * ((b - a) / 2) * ∫ s in a..b, |q s| := by rw [hsplitAbs]
  have hmain : 4 ≤ (b - a) * ∫ s in a..b, |q s| := by
    have hpos : 0 < |u c| := abs_pos.mpr hucne
    have h1 : 2 ≤ (b - a) / 2 * ∫ s in a..b, |q s| := by
      have hd : (|u c| * ((b - a) / 2) * ∫ s in a..b, |q s|) / |u c|
          = (b - a) / 2 * ∫ s in a..b, |q s| := by ring
      calc 2 = 2 * |u c| / |u c| := by field_simp
        _ ≤ (|u c| * ((b - a) / 2) * ∫ s in a..b, |q s|) / |u c| := by
            apply div_le_div_of_nonneg_right _ (le_of_lt hpos)
        _ = (b - a) / 2 * ∫ s in a..b, |q s| := hd
    linarith
  -- strictness
  by_contra hcontr
  push_neg at hcontr
  have hEq : ∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|
      = (c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s| := by
    have h1 : ∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|
        ≤ (c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s| :=
      add_le_add hub1' hub2'
    have h2 : (c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|
        ≤ (b - a) / 2 * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := by
      have hca : c - a ≤ (b - a) / 2 := by linarith
      have hbc : b - c ≤ (b - a) / 2 := by linarith
      have hX : 0 ≤ ∫ s in a..c, |q s| := intervalIntegral.integral_nonneg hac.le
        (fun s _ => abs_nonneg _)
      have hY : 0 ≤ ∫ s in c..b, |q s| := intervalIntegral.integral_nonneg hcb.le
        (fun s _ => abs_nonneg _)
      calc (c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|
          ≤ (b - a) / 2 * ∫ s in a..c, |q s| + (b - a) / 2 * ∫ s in c..b, |q s| :=
            add_le_add (mul_le_mul_of_nonneg_right hca hX)
              (mul_le_mul_of_nonneg_right hbc hY)
        _ = (b - a) / 2 * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := by ring
    have h3 : |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|)
        ≤ |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := by
      calc |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|)
          ≤ |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|) := cC
        _ ≤ |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := cD
    have h4 : |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|)
        ≤ 2 * |u c| := by
      have h5 : (b - a) / 2 * ∫ s in a..b, |q s| ≤ 2 := by linarith
      calc |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|)
          = |u c| * ((b - a) / 2 * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|)) := by ring
        _ = |u c| * ((b - a) / 2 * ∫ s in a..b, |q s|) := by rw [hsplitAbs]
        _ ≤ |u c| * 2 := mul_le_mul_of_nonneg_left h5 (abs_nonneg _)
        _ = 2 * |u c| := by ring
    have h5 : 2 * |u c| ≤ |u c| * (∫ s in a..c, (s - a) * |q s| * |u s|
        + ∫ s in c..b, (b - s) * |q s| * |u s|) := cA
    have h6 : 0 < |u c| := abs_pos.mpr hucne
    have h7 : |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|)
        = |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|) := by
      have e1 : |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|)
          ≤ |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|) := h3
      have e2 : |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|)
          ≤ |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|) := by
        calc |u c| * ((b - a) / 2) * (∫ s in a..c, |q s| + ∫ s in c..b, |q s|)
            ≤ 2 * |u c| := h4
          _ ≤ |u c| * (∫ s in a..c, (s - a) * |q s| * |u s|
              + ∫ s in c..b, (b - s) * |q s| * |u s|) := cA
          _ = |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|) := by
              rw [hub1, hub2]; ring
      linarith
    calc ∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|
        = |u c| * (∫ s in a..c, (s - a) * |q s| + ∫ s in c..b, (b - s) * |q s|) / |u c| := by
          field_simp
      _ = |u c| * ((c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s|) / |u c| := by
          rw [h7]
      _ = (c - a) * ∫ s in a..c, |q s| + (b - c) * ∫ s in c..b, |q s| := by ring
  have hEq1 : ∫ s in a..c, (s - a) * |q s| = (c - a) * ∫ s in a..c, |q s| := by linarith
  have hEq2 : ∫ s in c..b, (b - s) * |q s| = (b - c) * ∫ s in c..b, |q s| := by linarith
  -- hence q vanishes off the point c
  have hzero1 : ∫ s in a..c, (c - s) * |q s| = 0 := by
    have h1 : ∫ s in a..c, (s - a) * |q s| + ∫ s in a..c, (c - s) * |q s|
        = (c - a) * ∫ s in a..c, |q s| :=
      weight_split hac.le hIW1' hIW1'' hIAbs
    linarith
  have hzero2 : ∫ s in c..b, (s - c) * |q s| = 0 := by
    have h1 : ∫ s in c..b, (s - c) * |q s| + ∫ s in c..b, (b - s) * |q s|
        = (b - c) * ∫ s in c..b, |q s| :=
      weight_split hcb.le hIW2'' hIW2' hIAbs2
    linarith
  have hqz1 : ∀ s ∈ Set.Ioo a c, q s = 0 := by
    intro s hs
    have h1 : (c - s) * |q s| = 0 :=
      zero_of_zero_integral hac
        (((continuous_const.sub continuous_id).continuousOn).mul (habs q _ hqc))
        (fun t ht => mul_nonneg (by linarith [ht.2]) (abs_nonneg _)) hzero1 s ⟨hs.1, hs.2.le⟩
    have h2 : c - s ≠ 0 := by linarith
    have h3 : |q s| = 0 := by
      by_contra h4
      have : (c - s) * |q s| ≠ 0 := mul_ne_zero h2 h4
      exact this h1
    exact abs_eq_zero.mp h3
  have hqz2 : ∀ s ∈ Set.Ioo c b, q s = 0 := by
    intro s hs
    have h1 : (s - c) * |q s| = 0 :=
      zero_of_zero_integral hcb
        (((continuous_id.sub continuous_const).continuousOn).mul (habs q _ hqcb))
        (fun t ht => mul_nonneg (by linarith [ht.1]) (abs_nonneg _)) hzero2 s
        ⟨hac.le.trans hs.1, hs.2⟩
    have h2 : s - c ≠ 0 := by linarith
    have h3 : |q s| = 0 := by
      by_contra h4
      have : (s - c) * |q s| ≠ 0 := mul_ne_zero h2 h4
      exact this h1
    exact abs_eq_zero.mp h3
  -- u'' vanishes on (a, c) and (c, b)
  have huzz1 : ∀ s ∈ Set.Ioo a c, deriv (deriv u) s = 0 := by
    intro s hs
    have h1 := hode s (Set.Ioo_subset_Ioo le_rfl hcb.le hs)
    linarith [hqz1 s hs]
  have huzz2 : ∀ s ∈ Set.Ioo c b, deriv (deriv u) s = 0 := by
    intro s hs
    have h1 := hode s (Set.Ioo_subset_Ioo hac.le le_rfl hs)
    linarith [hqz2 s hs]
  -- hence u'' vanishes at c as well
  have huzzc : deriv (deriv u) c = 0 := by
    have hi1 : IntervalIntegrable (fun s => |deriv (deriv u) s|) volume a c :=
      hIi _ (habs (deriv (deriv u)) _ hu''cont.continuousOn)
    have hi2 : IntervalIntegrable (fun s => |deriv (deriv u) s|) volume c b :=
      hJi _ (habs (deriv (deriv u)) _ hu''cont.continuousOn)
    have hi0 : IntervalIntegrable (fun _ => (0 : ℝ)) volume a c :=
      (intervalIntegrable_const : IntervalIntegrable (fun _ => (0 : ℝ)) volume a c)
    have e1 : ∫ s in a..c, |deriv (deriv u) s| = 0 := by
      have h : ∫ s in a..c, |deriv (deriv u) s| = ∫ s in a..c, (0 : ℝ) :=
        integral_congr_Ioo hac hi1 hi0 (fun s hs => by have hh := huzz1 s hs; simp [hh])
      rw [h]; simp
    have e2 : ∫ s in c..b, |deriv (deriv u) s| = 0 := by
      have h : ∫ s in c..b, |deriv (deriv u) s| = ∫ s in c..b, (0 : ℝ) :=
        integral_congr_Ioo hcb hi2 (intervalIntegrable_const : IntervalIntegrable
          (fun _ => (0 : ℝ)) volume c b) (fun s hs => by have hh := huzz2 s hs; simp [hh])
      rw [h]; simp
    have e3 : ∫ s in a..b, |deriv (deriv u) s| = 0 := by
      have h : ∫ s in a..b, |deriv (deriv u) s|
          = ∫ s in a..c, |deriv (deriv u) s| + ∫ s in c..b, |deriv (deriv u) s| :=
        (intervalIntegral.integral_add_adjacent_intervals hi1 hi2).symm
      rw [h, e1, e2]; simp
    have := zero_of_zero_integral hab (habs (deriv (deriv u)) _ hu''cont.continuousOn)
      (fun s _ => abs_nonneg _) e3 c hcio
    exact abs_eq_zero.mp this
  have hqzc : q c = 0 := by
    have h1 := hode c hcio
    linarith [huzzc, hucne]
  -- so q vanishes on all of (a, b)
  have huzzAll : ∀ s ∈ Set.Ioo a b, deriv (deriv u) s = 0 := by
    intro s hs
    rcases lt_or_ge s c with h | h
    · exact huzz1 s ⟨hs.1, h⟩
    · rcases eq_or_lt_of_le h with h' | h'
      · exact h'
      · exact huzz2 s ⟨h', hs.2⟩
  obtain ⟨x₀, hx₀, hx₀ne⟩ := hne
  have hconst : ∀ s ∈ Set.Ioo a b, deriv u s = deriv u x₀ := by
    intro s hs
    exact IsOpen.is_const_of_deriv_eq_zero isOpen_Ioo isPreconnected_Ioo hu'diff.differentiableOn
      (fun s hs => huzzAll s hs) hs hx₀
  have huz : ∀ s ∈ Set.Ioo a b, u s = 0 := by
    intro s hs
    have hIAx : IntervalIntegrable (deriv u) volume a s := by
      have hc : ContinuousOn (deriv u) (Set.uIcc a s) := by
        rw [Set.uIcc_of_le (by linarith : a ≤ s)]; exact hu'cont.continuousOn
      exact hc.intervalIntegrable
    have hIBx : IntervalIntegrable (deriv u) volume s b := by
      have hc : ContinuousOn (deriv u) (Set.uIcc s b) := by
        rw [Set.uIcc_of_le (by linarith : s ≤ b)]; exact hu'cont.continuousOn
      exact hc.intervalIntegrable
    have hIAx2 : IntervalIntegrable (fun _ => deriv u x₀) volume a s :=
      (intervalIntegrable_const : IntervalIntegrable (fun _ => deriv u x₀) volume a s)
    have hIBx2 : IntervalIntegrable (fun _ => deriv u x₀) volume s b :=
      (intervalIntegrable_const : IntervalIntegrable (fun _ => deriv u x₀) volume s b)
    have e1 : ∫ t in a..s, deriv u t = u s - u a :=
      intervalIntegral.integral_deriv_eq_sub (fun x _ => (hu.differentiable (by norm_num)) x) hIAx
    have e2 : ∫ t in s..b, deriv u t = u b - u s :=
      intervalIntegral.integral_deriv_eq_sub (fun x _ => (hu.differentiable (by norm_num)) x) hIBx
    have e3 : ∫ t in a..s, deriv u t = ∫ t in a..s, (fun _ => deriv u x₀) :=
      integral_congr_Ioo (by linarith) hIAx hIAx2
        (fun t ht => hconst t ⟨ht.1, ht.2.trans hs.2⟩)
    have e4 : ∫ t in s..b, deriv u t = ∫ t in s..b, (fun _ => deriv u x₀) :=
      integral_congr_Ioo (by linarith) hIBx hIBx2
        (fun t ht => hconst t ⟨hs.1.trans ht.1, ht.2⟩)
    have e5 : ∫ t in a..s, (fun _ => deriv u x₀) = (s - a) * deriv u x₀ := by
      have hh := intervalIntegral.integral_const (deriv u x₀) (a := a) (b := s)
      simpa using hh
    have e6 : ∫ t in s..b, (fun _ => deriv u x₀) = (b - s) * deriv u x₀ := by
      have hh := intervalIntegral.integral_const (deriv u x₀) (a := s) (b := b)
      simpa using hh
    rw [ha] at e1
    rw [hb] at e2
    rw [e3, e5] at e1
    rw [e4, e6] at e2
    have hA : (s - a) * deriv u x₀ = u s := e1
    have hB : (b - s) * deriv u x₀ = -u s := e2
    have hC : (b - a) * deriv u x₀ = 0 := by
      calc (b - a) * deriv u x₀
          = (s - a) * deriv u x₀ + (b - s) * deriv u x₀ := by ring
        _ = u s + -u s := by rw [hA, hB]
        _ = 0 := by ring
    rcases mul_eq_zero.mp hC with h | h
    · exact absurd h (by linarith)
    · linarith
  exact hx₀ne (huz x₀ hx₀)
