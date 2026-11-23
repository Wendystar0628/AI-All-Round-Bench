import Mathlib

open Set MeasureTheory

/-- 左半段：`u(a)=0`，`u(c)=M>0`，`u'(c)=0`，且在 `[a,c]` 上 `|u| ≤ M`。 -/
lemma p1_left (u q : ℝ → ℝ) (a c M : ℝ) (hac : a < c)
    (hu : ContDiff ℝ 2 u) (hq : ContinuousOn q (Icc a c))
    (hode : ∀ t ∈ Icc a c, deriv (deriv u) t = -(q t * u t))
    (hM : 0 < M) (hmax : ∀ t ∈ Icc a c, |u t| ≤ M)
    (ha : u a = 0) (hc : u c = M) (hdc : deriv u c = 0) :
    1 < (c - a) * ∫ t in a..c, |q t| := by
  have hdu : ContDiff ℝ 1 (deriv u) := hu.deriv'
  have hcdu : Continuous (deriv u) := hdu.continuous
  have hcddu : Continuous (deriv (deriv u)) := hdu.continuous_deriv le_rfl
  have hdd : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hd1 : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hcu : Continuous u := hd1.continuous
  have hqabs : ContinuousOn (fun t => |q t|) (Icc a c) :=
    continuous_abs.comp_continuousOn hq
  have hqu : ContinuousOn (fun t => q t * u t) (Icc a c) := hq.mul hcu.continuousOn
  -- u'(x) = ∫_x^c q u
  have hformula : ∀ x ∈ Icc a c, deriv u x = ∫ t in x..c, q t * u t := by
    intro x hx
    have hxc : x ≤ c := hx.2
    have hFTC : ∫ t in x..c, deriv (deriv u) t = deriv u c - deriv u x :=
      intervalIntegral.integral_eq_sub_of_hasDerivAt
        (fun t _ => (hdd t).hasDerivAt) (hcddu.intervalIntegrable _ _)
    have hcongr : ∫ t in x..c, deriv (deriv u) t = ∫ t in x..c, -(q t * u t) := by
      apply intervalIntegral.integral_congr
      intro t ht
      rw [uIcc_of_le hxc] at ht
      exact hode t ⟨hx.1.trans ht.1, ht.2⟩
    rw [hcongr, intervalIntegral.integral_neg, hdc] at hFTC
    linarith
  -- 点态界 |u'(x)| ≤ M * Q
  have hbound : ∀ x ∈ Icc a c, |deriv u x| ≤ M * ∫ t in a..c, |q t| := by
    intro x hx
    have hxc : x ≤ c := hx.2
    have hsub : uIcc x c ⊆ Icc a c := uIcc_subset_Icc hx ⟨hac.le, le_rfl⟩
    have hsubA : uIcc a x ⊆ Icc a c := uIcc_subset_Icc ⟨le_rfl, hac.le⟩ hx
    have hI2 : IntervalIntegrable (fun t => |q t * u t|) volume x c :=
      (continuous_abs.comp_continuousOn (hqu.mono hsub)).intervalIntegrable
    have hqabsI : IntervalIntegrable (fun t => |q t|) volume x c :=
      (hqabs.mono hsub).intervalIntegrable
    have hqabsA : IntervalIntegrable (fun t => |q t|) volume a x :=
      (hqabs.mono hsubA).intervalIntegrable
    have h1 : |∫ t in x..c, q t * u t| ≤ ∫ t in x..c, |q t * u t| :=
      intervalIntegral.abs_integral_le_integral_abs hxc
    have h2 : ∫ t in x..c, |q t * u t| ≤ ∫ t in x..c, M * |q t| := by
      apply intervalIntegral.integral_mono_on hxc hI2 (hqabsI.const_mul M)
      intro t ht
      rw [abs_mul, mul_comm M]
      exact mul_le_mul_of_nonneg_left (hmax t ⟨hx.1.trans ht.1, ht.2⟩) (abs_nonneg _)
    have h3 : ∫ t in x..c, M * |q t| = M * ∫ t in x..c, |q t| :=
      intervalIntegral.integral_const_mul M _
    have h4 : ∫ t in x..c, |q t| ≤ ∫ t in a..c, |q t| := by
      have hsplit := intervalIntegral.integral_add_adjacent_intervals hqabsA hqabsI
      have hnn : 0 ≤ ∫ t in a..x, |q t| :=
        intervalIntegral.integral_nonneg hx.1 (fun t _ => abs_nonneg _)
      linarith
    have h5 : M * ∫ t in x..c, |q t| ≤ M * ∫ t in a..c, |q t| :=
      mul_le_mul_of_nonneg_left h4 hM.le
    rw [hformula x hx]
    linarith
  -- 端点关系
  have hFTCu : ∫ t in a..c, deriv u t = u c - u a :=
    intervalIntegral.integral_eq_sub_of_hasDerivAt
      (fun t _ => (hd1 t).hasDerivAt) (hcdu.intervalIntegrable _ _)
  have hQnn : 0 ≤ ∫ t in a..c, |q t| :=
    intervalIntegral.integral_nonneg hac.le (fun t _ => abs_nonneg _)
  set Q := ∫ t in a..c, |q t| with hQdef
  have hle : ∫ t in a..c, deriv u t ≤ ∫ t in a..c, M * Q := by
    apply intervalIntegral.integral_mono_on hac.le (hcdu.intervalIntegrable _ _)
      intervalIntegrable_const
    intro x hx
    exact (le_abs_self _).trans (hbound x hx)
  rw [hFTCu, ha, hc, intervalIntegral.integral_const, smul_eq_mul] at hle
  have hQpos : 0 < Q := by
    rcases hQnn.lt_or_eq with h | h
    · exact h
    · rw [← h] at hle
      nlinarith
  have hlt : ∫ t in a..c, deriv u t < ∫ t in a..c, M * Q :=
    intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt hac
      hcdu.continuousOn continuousOn_const
      (fun x hx => (le_abs_self _).trans (hbound x (Ioc_subset_Icc_self hx)))
      ⟨c, ⟨hac.le, le_rfl⟩, by rw [hdc]; exact mul_pos hM hQpos⟩
  rw [hFTCu, ha, hc, intervalIntegral.integral_const, smul_eq_mul] at hlt
  by_contra hcon
  have hcon' : (c - a) * Q ≤ 1 := not_lt.mp hcon
  nlinarith [mul_le_mul_of_nonneg_left hcon' hM.le]

/-- 右半段：`u(b)=0`，`u(c)=M>0`，`u'(c)=0`，且在 `[c,b]` 上 `|u| ≤ M`。 -/
lemma p1_right (u q : ℝ → ℝ) (c b M : ℝ) (hcb : c < b)
    (hu : ContDiff ℝ 2 u) (hq : ContinuousOn q (Icc c b))
    (hode : ∀ t ∈ Icc c b, deriv (deriv u) t = -(q t * u t))
    (hM : 0 < M) (hmax : ∀ t ∈ Icc c b, |u t| ≤ M)
    (hb : u b = 0) (hc : u c = M) (hdc : deriv u c = 0) :
    1 < (b - c) * ∫ t in c..b, |q t| := by
  have hdu : ContDiff ℝ 1 (deriv u) := hu.deriv'
  have hcdu : Continuous (deriv u) := hdu.continuous
  have hcddu : Continuous (deriv (deriv u)) := hdu.continuous_deriv le_rfl
  have hdd : Differentiable ℝ (deriv u) := hu.differentiable_deriv_two
  have hd1 : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hcu : Continuous u := hd1.continuous
  have hqabs : ContinuousOn (fun t => |q t|) (Icc c b) :=
    continuous_abs.comp_continuousOn hq
  have hqu : ContinuousOn (fun t => q t * u t) (Icc c b) := hq.mul hcu.continuousOn
  -- u'(x) = -∫_c^x q u
  have hformula : ∀ x ∈ Icc c b, deriv u x = -∫ t in c..x, q t * u t := by
    intro x hx
    have hcx : c ≤ x := hx.1
    have hFTC : ∫ t in c..x, deriv (deriv u) t = deriv u x - deriv u c :=
      intervalIntegral.integral_eq_sub_of_hasDerivAt
        (fun t _ => (hdd t).hasDerivAt) (hcddu.intervalIntegrable _ _)
    have hcongr : ∫ t in c..x, deriv (deriv u) t = ∫ t in c..x, -(q t * u t) := by
      apply intervalIntegral.integral_congr
      intro t ht
      rw [uIcc_of_le hcx] at ht
      exact hode t ⟨ht.1, ht.2.trans hx.2⟩
    rw [hcongr, intervalIntegral.integral_neg, hdc] at hFTC
    linarith
  -- 点态界 |u'(x)| ≤ M * Q
  have hbound : ∀ x ∈ Icc c b, |deriv u x| ≤ M * ∫ t in c..b, |q t| := by
    intro x hx
    have hcx : c ≤ x := hx.1
    have hsub : uIcc c x ⊆ Icc c b := uIcc_subset_Icc ⟨le_rfl, hcb.le⟩ hx
    have hsubB : uIcc x b ⊆ Icc c b := uIcc_subset_Icc hx ⟨hcb.le, le_rfl⟩
    have hI2 : IntervalIntegrable (fun t => |q t * u t|) volume c x :=
      (continuous_abs.comp_continuousOn (hqu.mono hsub)).intervalIntegrable
    have hqabsI : IntervalIntegrable (fun t => |q t|) volume c x :=
      (hqabs.mono hsub).intervalIntegrable
    have hqabsB : IntervalIntegrable (fun t => |q t|) volume x b :=
      (hqabs.mono hsubB).intervalIntegrable
    have h1 : |∫ t in c..x, q t * u t| ≤ ∫ t in c..x, |q t * u t| :=
      intervalIntegral.abs_integral_le_integral_abs hcx
    have h2 : ∫ t in c..x, |q t * u t| ≤ ∫ t in c..x, M * |q t| := by
      apply intervalIntegral.integral_mono_on hcx hI2 (hqabsI.const_mul M)
      intro t ht
      rw [abs_mul, mul_comm M]
      exact mul_le_mul_of_nonneg_left (hmax t ⟨ht.1, ht.2.trans hx.2⟩) (abs_nonneg _)
    have h3 : ∫ t in c..x, M * |q t| = M * ∫ t in c..x, |q t| :=
      intervalIntegral.integral_const_mul M _
    have h4 : ∫ t in c..x, |q t| ≤ ∫ t in c..b, |q t| := by
      have hsplit := intervalIntegral.integral_add_adjacent_intervals hqabsI hqabsB
      have hnn : 0 ≤ ∫ t in x..b, |q t| :=
        intervalIntegral.integral_nonneg hx.2 (fun t _ => abs_nonneg _)
      linarith
    have h5 : M * ∫ t in c..x, |q t| ≤ M * ∫ t in c..b, |q t| :=
      mul_le_mul_of_nonneg_left h4 hM.le
    rw [hformula x hx, abs_neg]
    linarith
  -- 端点关系：∫_c^b (-u') = M
  have hFTCu : ∫ t in c..b, deriv u t = u b - u c :=
    intervalIntegral.integral_eq_sub_of_hasDerivAt
      (fun t _ => (hd1 t).hasDerivAt) (hcdu.intervalIntegrable _ _)
  have hQnn : 0 ≤ ∫ t in c..b, |q t| :=
    intervalIntegral.integral_nonneg hcb.le (fun t _ => abs_nonneg _)
  set Q := ∫ t in c..b, |q t| with hQdef
  have hnegint : ∫ t in c..b, -deriv u t = M := by
    rw [intervalIntegral.integral_neg, hFTCu, hb, hc]
    ring
  have hle : ∫ t in c..b, -deriv u t ≤ ∫ t in c..b, M * Q := by
    apply intervalIntegral.integral_mono_on hcb.le ((hcdu.neg).intervalIntegrable _ _)
      intervalIntegrable_const
    intro x hx
    exact (neg_le_abs _).trans (hbound x hx)
  rw [hnegint, intervalIntegral.integral_const, smul_eq_mul] at hle
  have hQpos : 0 < Q := by
    rcases hQnn.lt_or_eq with h | h
    · exact h
    · rw [← h] at hle
      nlinarith
  have hlt : ∫ t in c..b, -deriv u t < ∫ t in c..b, M * Q :=
    intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt hcb
      hcdu.neg.continuousOn continuousOn_const
      (fun x hx => (neg_le_abs _).trans (hbound x (Ioc_subset_Icc_self hx)))
      ⟨c, ⟨le_rfl, hcb.le⟩, by rw [show -deriv u c = 0 by rw [hdc, neg_zero]]; exact mul_pos hM hQpos⟩
  rw [hnegint, intervalIntegral.integral_const, smul_eq_mul] at hlt
  by_contra hcon
  have hcon' : (b - c) * Q ≤ 1 := not_lt.mp hcon
  nlinarith [mul_le_mul_of_nonneg_left hcon' hM.le]

/-- 主引理：`u(c)` 为 `|u|` 在 `[a,b]` 上的最大值且为正。 -/
lemma p1_main (u q : ℝ → ℝ) (a b c : ℝ)
    (hu : ContDiff ℝ 2 u) (hq : ContinuousOn q (Icc a b))
    (hode : ∀ t ∈ Icc a b, deriv (deriv u) t = -(q t * u t))
    (ha : u a = 0) (hb : u b = 0) (hc : c ∈ Ioo a b) (hcpos : 0 < u c)
    (hmax : ∀ t ∈ Icc a b, |u t| ≤ u c) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hdc : deriv u c = 0 := by
    apply IsLocalMax.deriv_eq_zero
    filter_upwards [Ioo_mem_nhds hc.1 hc.2] with t ht
    exact (le_abs_self _).trans (hmax t (Ioo_subset_Icc_self ht))
  have hL := p1_left u q a c (u c) hc.1 hu (hq.mono (Icc_subset_Icc le_rfl hc.2.le))
    (fun t ht => hode t ⟨ht.1, ht.2.trans hc.2.le⟩) hcpos
    (fun t ht => hmax t ⟨ht.1, ht.2.trans hc.2.le⟩) ha rfl hdc
  have hR := p1_right u q c b (u c) hc.2 hu (hq.mono (Icc_subset_Icc hc.1.le le_rfl))
    (fun t ht => hode t ⟨hc.1.le.trans ht.1, ht.2⟩) hcpos
    (fun t ht => hmax t ⟨hc.1.le.trans ht.1, ht.2⟩) hb rfl hdc
  have hqabs : ContinuousOn (fun t => |q t|) (Icc a b) :=
    continuous_abs.comp_continuousOn hq
  have hI1 : IntervalIntegrable (fun t => |q t|) volume a c :=
    (hqabs.mono (Icc_subset_Icc le_rfl hc.2.le)).intervalIntegrable_of_Icc hc.1.le
  have hI2 : IntervalIntegrable (fun t => |q t|) volume c b :=
    (hqabs.mono (Icc_subset_Icc hc.1.le le_rfl)).intervalIntegrable_of_Icc hc.2.le
  have hsplit : ∫ x in a..b, |q x| = (∫ x in a..c, |q x|) + ∫ x in c..b, |q x| :=
    (intervalIntegral.integral_add_adjacent_intervals hI1 hI2).symm
  rw [hsplit]
  have hQL : 0 ≤ ∫ x in a..c, |q x| :=
    intervalIntegral.integral_nonneg hc.1.le (fun t _ => abs_nonneg _)
  have hQR : 0 ≤ ∫ x in c..b, |q x| :=
    intervalIntegral.integral_nonneg hc.2.le (fun t _ => abs_nonneg _)
  have hX : 0 < c - a := by linarith [hc.1]
  have hY : 0 < b - c := by linarith [hc.2]
  have hPR : 1 < ((c - a) * ∫ x in a..c, |q x|) * ((b - c) * ∫ x in c..b, |q x|) := by
    nlinarith [hL, hR]
  have hsum : 2 < (b - c) * (∫ x in a..c, |q x|) + (c - a) * (∫ x in c..b, |q x|) := by
    nlinarith [mul_nonneg hY.le hQL, mul_nonneg hX.le hQR,
      sq_nonneg ((b - c) * (∫ x in a..c, |q x|) - (c - a) * (∫ x in c..b, |q x|))]
  nlinarith [hL, hR, hsum]

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hcu : Continuous u := (hu.differentiable (by norm_num)).continuous
  have hcddu : Continuous (deriv (deriv u)) := (hu.deriv').continuous_deriv le_rfl
  have hode' : ∀ t ∈ Icc a b, deriv (deriv u) t = -(q t * u t) := by
    intro t ht
    have hEq : EqOn (deriv (deriv u)) (fun t => -(q t * u t)) (Ioo a b) := by
      intro s hs
      have := hode s hs
      simp only
      linarith
    exact EqOn.of_subset_closure hEq hcddu.continuousOn
      (hq.mul hcu.continuousOn).neg Ioo_subset_Icc_self
      (by rw [closure_Ioo hab.ne]) ht
  obtain ⟨x0, hx0, hux0⟩ := hne
  obtain ⟨c, hc_mem, hc_max⟩ := isCompact_Icc.exists_isMaxOn (nonempty_Icc.mpr hab.le)
    (continuous_abs.comp hcu).continuousOn
  have hmaxc : ∀ t ∈ Icc a b, |u t| ≤ |u c| := fun t ht => isMaxOn_iff.mp hc_max t ht
  have hpos : 0 < |u c| := lt_of_lt_of_le (abs_pos.mpr hux0) (hmaxc x0 (Ioo_subset_Icc_self hx0))
  have hcIoo : c ∈ Ioo a b := by
    refine ⟨lt_of_le_of_ne hc_mem.1 (fun h => ?_), lt_of_le_of_ne hc_mem.2 (fun h => ?_)⟩
    · rw [← h, ha, abs_zero] at hpos
      exact lt_irrefl _ hpos
    · rw [h, hb, abs_zero] at hpos
      exact lt_irrefl _ hpos
  have hne0 : u c ≠ 0 := abs_pos.mp hpos
  rcases lt_or_gt_of_ne hne0 with hneg | hposc
  · -- u(c) < 0：对 -u 应用主引理
    have hmaxn : ∀ t ∈ Icc a b, |(fun x => -u x) t| ≤ (fun x => -u x) c := by
      intro t ht
      have h1 := hmaxc t ht
      rw [abs_of_neg hneg] at h1
      show |-u t| ≤ -u c
      rw [abs_neg]
      linarith
    have hodeN : ∀ t ∈ Icc a b,
        deriv (deriv (fun x => -u x)) t = -(q t * (fun x => -u x) t) := by
      intro t ht
      have h1 : deriv (fun x => -u x) = fun x => -deriv u x := deriv.neg'
      have h2 : deriv (fun x => -deriv u x) = fun x => -deriv (deriv u) x := deriv.neg'
      rw [h1, h2]
      show -deriv (deriv u) t = -(q t * -u t)
      rw [hode' t ht]
      ring
    exact p1_main (fun x => -u x) q a b c hu.neg hq hodeN
      (by simp [ha]) (by simp [hb]) hcIoo (by show 0 < -u c; linarith) hmaxn
  · have hmaxp : ∀ t ∈ Icc a b, |u t| ≤ u c := by
      intro t ht
      have h1 := hmaxc t ht
      rw [abs_of_pos hposc] at h1
      exact h1
    exact p1_main u q a b c hu hq hode' ha hb hcIoo hposc hmaxp
