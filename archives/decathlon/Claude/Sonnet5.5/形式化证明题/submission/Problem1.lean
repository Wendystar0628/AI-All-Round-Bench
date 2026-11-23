import Mathlib

lemma p1_core (q u ω : ℝ → ℝ) (s t M Ω : ℝ) (hst : s < t)
    (hq : ContinuousOn q (Set.Icc s t)) (hu : ContinuousOn u (Set.Icc s t))
    (hω : ContinuousOn ω (Set.Icc s t))
    (hM : 0 < M) (hub : ∀ x ∈ Set.Icc s t, |u x| ≤ M)
    (hω0 : ∀ x ∈ Set.Icc s t, 0 ≤ ω x) (hωΩ : ∀ x ∈ Set.Icc s t, ω x ≤ Ω)
    (hωlt : ∀ x ∈ Set.Ioo s t, ω x < Ω)
    (hint : M = ∫ x in s..t, ω x * q x * u x) :
    1 < Ω * ∫ x in s..t, |q x| := by
  have hex : ∃ x0 ∈ Set.Ioo s t, q x0 ≠ 0 := by
    by_contra hcon
    have hcon' : ∀ x0 ∈ Set.Ioo s t, q x0 = 0 := by
      intro x0 hx0
      by_contra h
      exact hcon ⟨x0, hx0, h⟩
    have hzero : Set.EqOn q (fun _ => 0) (Set.Icc s t) :=
      Set.EqOn.of_subset_closure (s := Set.Ioo s t) (fun x hx => hcon' x hx) hq continuousOn_const
        Set.Ioo_subset_Icc_self (by rw [closure_Ioo hst.ne])
    have h0 : (∫ x in s..t, ω x * q x * u x) = ∫ x in s..t, (0:ℝ) := by
      apply intervalIntegral.integral_congr
      intro x hx
      rw [Set.uIcc_of_le hst.le] at hx
      simp [hzero hx]
    simp at h0
    linarith
  obtain ⟨x0, hx0, hqx0⟩ := hex
  have hcont1 : ContinuousOn (fun x => ω x * |q x| * |u x|) (Set.Icc s t) :=
    (hω.mul hq.abs).mul hu.abs
  have hlt : (∫ x in s..t, ω x * |q x| * |u x|) < ∫ x in s..t, Ω * M * |q x| := by
    apply intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt hst hcont1
    · exact continuousOn_const.mul hq.abs
    · intro x hx
      have hx' : x ∈ Set.Icc s t := Set.Ioc_subset_Icc_self hx
      have h1 := hω0 x hx'
      have h2 := hωΩ x hx'
      have h3 := hub x hx'
      have e1 := mul_nonneg (sub_nonneg.2 h2) (mul_nonneg (abs_nonneg (q x)) hM.le)
      have e2 := mul_nonneg (mul_nonneg h1 (abs_nonneg (q x))) (sub_nonneg.2 h3)
      nlinarith
    · refine ⟨x0, Set.Ioo_subset_Icc_self hx0, ?_⟩
      have h1 := hω0 x0 (Set.Ioo_subset_Icc_self hx0)
      have h2 := hωlt x0 hx0
      have h3 := hub x0 (Set.Ioo_subset_Icc_self hx0)
      have hpos : 0 < |q x0| := abs_pos.mpr hqx0
      have e1 := mul_pos (sub_pos.2 h2) (mul_pos hpos hM)
      have e2 := mul_nonneg (mul_nonneg h1 hpos.le) (sub_nonneg.2 h3)
      nlinarith
  have hle : M ≤ ∫ x in s..t, ω x * |q x| * |u x| := by
    rw [hint]
    apply intervalIntegral.integral_mono_on hst.le
    · exact ((hω.mul hq).mul hu).intervalIntegrable_of_Icc hst.le
    · exact hcont1.intervalIntegrable_of_Icc hst.le
    · intro x hx
      have h1 := hω0 x hx
      have : q x * u x ≤ |q x| * |u x| := by rw [← abs_mul]; exact le_abs_self _
      nlinarith
  have hconst : (∫ x in s..t, Ω * M * |q x|) = Ω * M * ∫ x in s..t, |q x| := by
    rw [intervalIntegral.integral_const_mul]
  rw [hconst] at hlt
  have : M * 1 < M * (Ω * ∫ x in s..t, |q x|) := by nlinarith
  exact lt_of_mul_lt_mul_left this hM.le

lemma p1_final (α β I1 I2 : ℝ) (hα : 0 < α) (hβ : 0 < β) (h1 : 1 < α * I1) (h2 : 1 < β * I2) :
    4 < (α + β) * (I1 + I2) := by
  have hI1 : 0 < I1 := by
    by_contra h
    have h := not_lt.mp h
    nlinarith
  have hI2 : 0 < I2 := by
    by_contra h
    have h := not_lt.mp h
    nlinarith
  have hxy : 1 < (α * I2) * (β * I1) := by
    nlinarith [mul_pos (sub_pos.2 h1) (sub_pos.2 h2)]
  have hx : 0 < α * I2 := mul_pos hα hI2
  have hy : 0 < β * I1 := mul_pos hβ hI1
  have hsum : 2 < α * I2 + β * I1 := by
    by_contra h
    have h := not_lt.mp h
    nlinarith [sq_nonneg (α * I2 - β * I1)]
  nlinarith

lemma p1_main (q u : ℝ → ℝ) (a b c : ℝ) (hab : a < b) (hc : c ∈ Set.Ioo a b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hcpos : 0 < u c) (hmax : ∀ x ∈ Set.Icc a b, |u x| ≤ u c) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  obtain ⟨hac, hcb⟩ := hc
  have hu1 : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hw : ContDiff ℝ 1 (deriv u) := by
    have := (contDiff_succ_iff_deriv (n := 1) (f := u)).mp (by rw [one_add_one_eq_two]; exact hu)
    exact this.2.2
  obtain ⟨hw1, hv⟩ := contDiff_one_iff_deriv.mp hw
  have hu_cont : Continuous u := hu1.continuous
  have hu'c : deriv u c = 0 := by
    apply IsLocalMax.deriv_eq_zero
    have : Set.Icc a b ∈ nhds c := Icc_mem_nhds hac hcb
    filter_upwards [this] with x hx
    exact (le_abs_self _).trans (hmax x hx)
  have hode' : ∀ x ∈ Set.Icc a b, deriv (deriv u) x + q x * u x = 0 := by
    have hcl : Set.EqOn (fun x => deriv (deriv u) x + q x * u x) (fun _ => (0:ℝ)) (Set.Icc a b) := by
      apply Set.EqOn.of_subset_closure (s := Set.Ioo a b) (fun x hx => hode x hx) _
        continuousOn_const Set.Ioo_subset_Icc_self (by rw [closure_Ioo hab.ne])
      exact hv.continuousOn.add (hq.mul hu_cont.continuousOn)
    exact fun x hx => hcl hx
  have hd1 : ∀ x, HasDerivAt u (deriv u x) x := fun x => (hu1 x).hasDerivAt
  have hd2 : ∀ x, HasDerivAt (deriv u) (deriv (deriv u) x) x := fun x => (hw1 x).hasDerivAt
  -- left identity
  have hL : u c = ∫ x in a..c, (x - a) * q x * u x := by
    have hΦ : ∀ x, HasDerivAt (fun x => u x - (x - a) * deriv u x)
        (-((x - a) * deriv (deriv u) x)) x := by
      intro x
      have h1 : HasDerivAt (fun x => x - a) 1 x := (hasDerivAt_id x).sub_const a
      have h2 : HasDerivAt (fun x => (x - a) * deriv u x)
          (1 * deriv u x + (x - a) * deriv (deriv u) x) x := h1.mul (hd2 x)
      have h3 := (hd1 x).sub h2
      convert h3 using 1
      ring
    have hFTC := intervalIntegral.integral_eq_sub_of_hasDerivAt (a := a) (b := c)
      (f := fun x => u x - (x - a) * deriv u x)
      (f' := fun x => -((x - a) * deriv (deriv u) x))
      (fun x _ => hΦ x)
      (Continuous.intervalIntegrable ((continuous_id.sub continuous_const).mul hv).neg _ _)
    have hcongr : (∫ x in a..c, (x - a) * q x * u x)
        = ∫ x in a..c, -((x - a) * deriv (deriv u) x) := by
      apply intervalIntegral.integral_congr
      intro x hx
      rw [Set.uIcc_of_le hac.le] at hx
      have hxab : x ∈ Set.Icc a b := ⟨hx.1, hx.2.trans hcb.le⟩
      have h5 : deriv (deriv u) x = -(q x * u x) := by linarith [hode' x hxab]
      simp only
      rw [h5]; ring
    rw [hcongr, hFTC, hu'c, ha]
    simp
  -- right identity
  have hR : u c = ∫ x in c..b, (b - x) * q x * u x := by
    have hΨ : ∀ x, HasDerivAt (fun x => (x - b) * deriv u x - u x)
        ((x - b) * deriv (deriv u) x) x := by
      intro x
      have h1 : HasDerivAt (fun x => x - b) 1 x := (hasDerivAt_id x).sub_const b
      have h2 : HasDerivAt (fun x => (x - b) * deriv u x)
          (1 * deriv u x + (x - b) * deriv (deriv u) x) x := h1.mul (hd2 x)
      have h3 := h2.sub (hd1 x)
      convert h3 using 1
      ring
    have hFTC := intervalIntegral.integral_eq_sub_of_hasDerivAt (a := c) (b := b)
      (f := fun x => (x - b) * deriv u x - u x)
      (f' := fun x => (x - b) * deriv (deriv u) x)
      (fun x _ => hΨ x)
      (Continuous.intervalIntegrable ((continuous_id.sub continuous_const).mul hv) _ _)
    have hcongr : (∫ x in c..b, (b - x) * q x * u x)
        = ∫ x in c..b, (x - b) * deriv (deriv u) x := by
      apply intervalIntegral.integral_congr
      intro x hx
      rw [Set.uIcc_of_le hcb.le] at hx
      have hxab : x ∈ Set.Icc a b := ⟨hac.le.trans hx.1, hx.2⟩
      have h5 : deriv (deriv u) x = -(q x * u x) := by linarith [hode' x hxab]
      simp only
      rw [h5]; ring
    rw [hcongr, hFTC, hu'c, hb]
    simp
  have hq1 : ContinuousOn q (Set.Icc a c) := hq.mono (Set.Icc_subset_Icc le_rfl hcb.le)
  have hq2 : ContinuousOn q (Set.Icc c b) := hq.mono (Set.Icc_subset_Icc hac.le le_rfl)
  have hI1 : 1 < (c - a) * ∫ x in a..c, |q x| := by
    apply p1_core q u (fun x => x - a) a c (u c) (c - a) hac hq1 hu_cont.continuousOn
      (by fun_prop) hcpos
    · intro x hx; exact hmax x ⟨hx.1, hx.2.trans hcb.le⟩
    · intro x hx; linarith [hx.1]
    · intro x hx; linarith [hx.2]
    · intro x hx; linarith [hx.2]
    · exact hL
  have hI2 : 1 < (b - c) * ∫ x in c..b, |q x| := by
    apply p1_core q u (fun x => b - x) c b (u c) (b - c) hcb hq2 hu_cont.continuousOn
      (by fun_prop) hcpos
    · intro x hx; exact hmax x ⟨hac.le.trans hx.1, hx.2⟩
    · intro x hx; linarith [hx.2]
    · intro x hx; linarith [hx.1]
    · intro x hx; linarith [hx.1]
    · exact hR
  have hint_add : ∫ x in a..b, |q x| = (∫ x in a..c, |q x|) + ∫ x in c..b, |q x| :=
    (intervalIntegral.integral_add_adjacent_intervals
      ((hq1.abs).intervalIntegrable_of_Icc hac.le)
      ((hq2.abs).intervalIntegrable_of_Icc hcb.le)).symm
  rw [hint_add]
  have := p1_final (c - a) (b - c) _ _ (by linarith) (by linarith) hI1 hI2
  have e : b - a = (c - a) + (b - c) := by ring
  rw [e]
  exact this

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hu_cont : Continuous u := hu.continuous
  obtain ⟨c, hcmem, hcmax⟩ := (isCompact_Icc (a := a) (b := b)).exists_isMaxOn
    (Set.nonempty_Icc.mpr hab.le) (hu_cont.abs.continuousOn)
  obtain ⟨x0, hx0, hux0⟩ := hne
  have hmax : ∀ x ∈ Set.Icc a b, |u x| ≤ |u c| := fun x hx => isMaxOn_iff.mp hcmax x hx
  have hux0' : |u x0| ≤ |u c| := hmax x0 (Set.Ioo_subset_Icc_self hx0)
  have hcpos : 0 < |u c| := lt_of_lt_of_le (abs_pos.mpr hux0) hux0'
  have hca : c ≠ a := by
    rintro rfl
    rw [ha] at hcpos
    simp at hcpos
  have hcb : c ≠ b := by
    rintro rfl
    rw [hb] at hcpos
    simp at hcpos
  have hc : c ∈ Set.Ioo a b := ⟨lt_of_le_of_ne hcmem.1 (Ne.symm hca), lt_of_le_of_ne hcmem.2 hcb⟩
  rcases lt_or_gt_of_ne (abs_pos.mp hcpos) with hneg | hpos
  · have h1 : deriv (-u) = -deriv u := by
      funext y
      exact deriv.neg
    have := p1_main q (-u) a b c hab hc hq hu.neg ?_ (by simp [ha]) (by simp [hb]) ?_ ?_
    · exact this
    · intro x hx
      have h2 : deriv (deriv (-u)) x = -deriv (deriv u) x := by
        rw [h1]; exact deriv.neg
      rw [h2]
      have := hode x hx
      simp only [Pi.neg_apply]
      linarith
    · simp only [Pi.neg_apply]
      linarith
    · intro x hx
      simp only [Pi.neg_apply]
      have := hmax x hx
      rw [abs_of_neg hneg] at this
      rw [abs_neg]
      exact this
  · exact p1_main q u a b c hab hc hq hu hode ha hb hpos
      (fun x hx => by have := hmax x hx; rwa [abs_of_pos hpos] at this)
