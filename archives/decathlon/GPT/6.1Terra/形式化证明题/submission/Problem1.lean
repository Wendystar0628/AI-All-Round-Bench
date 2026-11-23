import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus
import Mathlib.Tactic

open Set MeasureTheory intervalIntegral

lemma strict_slope_bound (f : ℝ → ℝ) (a b K c : ℝ) (hab : a < b)
    (hf : Differentiable ℝ f) (hd : Continuous (deriv f))
    (hbound : ∀ x ∈ Icc a b, |deriv f x| ≤ K)
    (hc : c ∈ Icc a b) (hzero : deriv f c = 0) (hK : 0 < K) :
    |f b - f a| < (b - a) * K := by
  have hstrict : (∫ x in a..b, |deriv f x|) < ∫ _ in a..b, K := by
    apply intervalIntegral.integral_lt_integral_of_continuousOn_of_le_of_exists_lt
      hab hd.abs.continuousOn continuousOn_const
    · intro x hx
      exact hbound x ⟨hx.1.le, hx.2⟩
    · exact ⟨c, hc, by simpa [hzero] using hK⟩
  have hFTC : (∫ x in a..b, deriv f x) = f b - f a :=
    intervalIntegral.integral_deriv_eq_sub (fun x _ => hf x) (hd.intervalIntegrable _ _)
  have hle := intervalIntegral.abs_integral_le_integral_abs (μ := volume) (f := deriv f) hab.le
  rw [hFTC] at hle
  simp only [intervalIntegral.integral_const, smul_eq_mul] at hstrict
  exact lt_of_le_of_lt hle hstrict

lemma slope_bound (f : ℝ → ℝ) (a b K : ℝ) (hab : a ≤ b)
    (hf : Differentiable ℝ f) (hd : Continuous (deriv f))
    (hbound : ∀ x ∈ Icc a b, |deriv f x| ≤ K) :
    |f b - f a| ≤ (b - a) * K := by
  have hboundint : (∫ x in a..b, |deriv f x|) ≤ ∫ _ in a..b, K := by
    apply intervalIntegral.integral_mono_on hab (hd.abs.intervalIntegrable _ _)
      (intervalIntegrable_const)
    exact hbound
  have hFTC : (∫ x in a..b, deriv f x) = f b - f a :=
    intervalIntegral.integral_deriv_eq_sub (fun x _ => hf x) (hd.intervalIntegrable _ _)
  have hle := intervalIntegral.abs_integral_le_integral_abs (μ := volume) (f := deriv f) hab
  rw [hFTC] at hle
  simp only [intervalIntegral.integral_const, smul_eq_mul] at hboundint
  exact le_trans hle hboundint

lemma four_lt_of_two (A B L R : ℝ) (hA : 0 < A) (hB : 0 < B)
    (hL : 1 < A * L) (hR : 1 < B * R) : 4 < (A + B) * (L + R) := by
  have hp : 0 < A * B := mul_pos hA hB
  have h1 := mul_lt_mul_of_pos_left hL hB
  have h2 := mul_lt_mul_of_pos_left hR hA
  have h3 : A + B < (A * B) * (L + R) := by nlinarith
  have h4 := mul_lt_mul_of_pos_left h3 (show 0 < A + B by linarith)
  nlinarith [sq_nonneg (A - B)]

lemma abs_le_integral_of_deriv_bound (v g : ℝ → ℝ) (l r c : ℝ)
    (hlr : l ≤ r) (hvc : v c = 0) (hc : c ∈ Icc l r)
    (hv : Differentiable ℝ v) (hdv : Continuous (deriv v))
    (hg : ContinuousOn g (Icc l r)) (hgn : ∀ x, 0 ≤ g x)
    (hbound : ∀ x ∈ Ioo l r, |deriv v x| ≤ g x) :
    ∀ x ∈ Icc l r, |v x| ≤ ∫ t in l..r, g t := by
  have hgi : IntervalIntegrable g volume l r := hg.intervalIntegrable_of_Icc hlr
  have hstep : ∀ x y, l ≤ x → x ≤ y → y ≤ r →
      |v y - v x| ≤ ∫ t in l..r, g t := by
    intro x y hlx hxy hyr
    have hgi' : IntervalIntegrable g volume x y :=
      (hg.mono (Icc_subset_Icc hlx hyr)).intervalIntegrable_of_Icc hxy
    have hmono : (∫ t in x..y, |deriv v t|) ≤ ∫ t in x..y, g t := by
      apply intervalIntegral.integral_mono_on_of_le_Ioo hxy
        (hdv.abs.intervalIntegrable _ _) hgi'
      intro t ht
      exact hbound t ⟨lt_of_le_of_lt hlx ht.1, lt_of_lt_of_le ht.2 hyr⟩
    have hsub : (∫ t in x..y, g t) ≤ ∫ t in l..r, g t :=
      intervalIntegral.integral_mono_interval hlx hxy hyr (Filter.Eventually.of_forall hgn) hgi
    have hftc : (∫ t in x..y, deriv v t) = v y - v x :=
      intervalIntegral.integral_deriv_eq_sub (fun t _ => hv t) (hdv.intervalIntegrable _ _)
    have h := intervalIntegral.abs_integral_le_integral_abs (μ := volume) (f := deriv v) hxy
    rw [hftc] at h
    exact h.trans (hmono.trans hsub)
  intro x hx
  rcases le_total x c with hxc | hcx
  · have h := hstep x c hx.1 hxc hc.2
    simpa [hvc] using h
  · have h := hstep c x hc.1 hcx hx.2
    simpa [hvc] using h

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Set.Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Set.Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Set.Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have hdu : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hcu : Continuous u := hu.continuous
  have hd1 : ContDiff ℝ 1 (deriv u) := hu.deriv'
  have hdv : Differentiable ℝ (deriv u) := hd1.differentiable (by norm_num)
  have hc1 : Continuous (deriv u) := hu.continuous_deriv (by norm_num)
  have hc2 : Continuous (deriv (deriv u)) := hd1.continuous_deriv (by norm_num)
  obtain ⟨c, hc, hmax⟩ := isCompact_Icc.exists_isMaxOn
    (show (Icc a b).Nonempty from ⟨a, le_rfl, hab.le⟩) hcu.abs.continuousOn
  obtain ⟨x, hx, hne⟩ := hne
  have hM : 0 < |u c| := (abs_pos.mpr hne).trans_le (hmax (Ioo_subset_Icc_self hx))
  have hca : a < c := by
    have hneca : c ≠ a := by
      intro h
      rw [h, ha, abs_zero] at hM
      exact (lt_irrefl 0) hM
    exact lt_of_le_of_ne hc.1 (Ne.symm hneca)
  have hcb : c < b := by
    have hnecb : c ≠ b := by
      intro h
      rw [h, hb, abs_zero] at hM
      exact (lt_irrefl 0) hM
    exact lt_of_le_of_ne hc.2 hnecb
  have hcrit : deriv u c = 0 := by
    have huc : u c ≠ 0 := abs_pos.mp hM
    rcases lt_or_gt_of_ne huc with hneg | hpos
    · have hm : IsMinOn u (Icc a b) c := by
        intro y hy
        calc
          u c = - |u c| := by rw [abs_of_neg hneg]; ring
          _ ≤ - |u y| := neg_le_neg (hmax hy)
          _ ≤ u y := neg_abs_le _
      exact (hm.isLocalMin (Icc_mem_nhds hca hcb)).deriv_eq_zero
    · have hm : IsMaxOn u (Icc a b) c := by
        intro y hy
        calc
          u y ≤ |u y| := le_abs_self _
          _ ≤ |u c| := hmax hy
          _ = u c := abs_of_pos hpos
      exact (hm.isLocalMax (Icc_mem_nhds hca hcb)).deriv_eq_zero
  have hodeBound : ∀ t ∈ Ioo a b, |deriv (deriv u) t| ≤ |u c| * |q t| := by
    intro t ht
    have heq : deriv (deriv u) t = -(q t * u t) := by linarith [hode t ht]
    rw [heq, abs_neg, abs_mul, mul_comm]
    exact mul_le_mul_of_nonneg_right (hmax (Ioo_subset_Icc_self ht)) (abs_nonneg _)
  let L := ∫ t in a..c, |q t|
  let R := ∫ t in c..b, |q t|
  let G := fun t => |u c| * |q t|
  have hGpos : ∀ t, 0 ≤ G t := fun t => mul_nonneg (abs_nonneg _) (abs_nonneg _)
  have hGL : ContinuousOn G (Icc a c) :=
    continuousOn_const.mul ((hq.mono (Icc_subset_Icc le_rfl hc.2)).abs)
  have hGR : ContinuousOn G (Icc c b) :=
    continuousOn_const.mul ((hq.mono (Icc_subset_Icc hc.1 le_rfl)).abs)
  have hboundL : ∀ t ∈ Icc a c, |deriv u t| ≤ |u c| * L := by
    have h := abs_le_integral_of_deriv_bound (deriv u) G a c c hca.le hcrit
      ⟨hca.le, le_rfl⟩ hdv hc2 hGL hGpos
      (by intro t ht; exact hodeBound t ⟨ht.1, ht.2.trans hcb⟩)
    simpa [G, L, intervalIntegral.integral_const_mul] using h
  have hboundR : ∀ t ∈ Icc c b, |deriv u t| ≤ |u c| * R := by
    have h := abs_le_integral_of_deriv_bound (deriv u) G c b c hcb.le hcrit
      ⟨le_rfl, hcb.le⟩ hdv hc2 hGR hGpos
      (by intro t ht; exact hodeBound t ⟨hca.trans ht.1, ht.2⟩)
    simpa [G, R, intervalIntegral.integral_const_mul] using h
  have hleL : |u c| ≤ (c - a) * (|u c| * L) := by
    simpa [ha] using slope_bound u a c (|u c| * L) hca.le hdu hc1 hboundL
  have hleR : |u c| ≤ (b - c) * (|u c| * R) := by
    simpa [hb] using slope_bound u c b (|u c| * R) hcb.le hdu hc1 hboundR
  have hKL : 0 < |u c| * L := by nlinarith
  have hKR : 0 < |u c| * R := by nlinarith
  have hstrictL : |u c| < (c - a) * (|u c| * L) := by
    simpa [ha] using strict_slope_bound u a c (|u c| * L) c hca hdu hc1 hboundL
      ⟨hca.le, le_rfl⟩ hcrit hKL
  have hstrictR : |u c| < (b - c) * (|u c| * R) := by
    simpa [hb] using strict_slope_bound u c b (|u c| * R) c hcb hdu hc1 hboundR
      ⟨le_rfl, hcb.le⟩ hcrit hKR
  have hL : 1 < (c - a) * L := by
    by_contra! h
    have hm := mul_le_mul_of_nonneg_left h hM.le
    nlinarith
  have hR : 1 < (b - c) * R := by
    by_contra! h
    have hm := mul_le_mul_of_nonneg_left h hM.le
    nlinarith
  have hqiL : IntervalIntegrable (fun t => |q t|) volume a c :=
    (hq.abs.mono (Icc_subset_Icc le_rfl hc.2)).intervalIntegrable_of_Icc hca.le
  have hqiR : IntervalIntegrable (fun t => |q t|) volume c b :=
    (hq.abs.mono (Icc_subset_Icc hc.1 le_rfl)).intervalIntegrable_of_Icc hcb.le
  have hsum : L + R = ∫ t in a..b, |q t| :=
    intervalIntegral.integral_add_adjacent_intervals hqiL hqiR
  have hfinal := four_lt_of_two (c - a) (b - c) L R (by linarith) (by linarith) hL hR
  rw [hsum] at hfinal
  convert hfinal using 1 <;> ring