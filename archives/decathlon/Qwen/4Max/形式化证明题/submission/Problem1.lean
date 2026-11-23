import Mathlib.Analysis.Calculus.ContDiff.Deriv
import Mathlib.Analysis.Calculus.LocalExtr.Basic
import Mathlib.MeasureTheory.Integral.IntervalIntegral.IntegrationByParts
import Mathlib.MeasureTheory.Integral.IntervalIntegral.FundThmCalculus
import Mathlib.Analysis.SpecialFunctions.Sqrt

open Set MeasureTheory intervalIntegral
open scoped Topology

-- If `q` is continuous on `[α, β]` with `∫ |q| > 0`, and `w > 0` on the interior,
-- then `∫ w * |q| > 0`.
lemma integral_weight_pos {w q : ℝ → ℝ} {α β : ℝ} (hαβ : α < β)
    (hw : ContinuousOn w (Icc α β)) (hwpos : ∀ x ∈ Ioo α β, 0 < w x)
    (hq : ContinuousOn q (Icc α β)) (hA : 0 < ∫ x in α..β, |q x|) :
    0 < ∫ x in α..β, w x * |q x| := by
  have hqnonneg : 0 ≤ᵐ[volume.restrict (uIoc α β)] fun x : ℝ => |q x| := by
    rw [uIoc_of_le hαβ.le]
    exact (ae_restrict_iff' measurableSet_Ioc).mpr (.of_forall fun x _ => abs_nonneg _)
  have hqint : IntervalIntegrable (fun x : ℝ => |q x|) volume α β :=
    hq.abs.intervalIntegrable_of_Icc hαβ.le
  have hsuppA : 0 < volume (Function.support (fun x : ℝ => |q x|) ∩ Ioc α β) :=
    ((integral_pos_iff_support_of_nonneg_ae' hqnonneg hqint).mp hA).2
  have hwnonneg : 0 ≤ᵐ[volume.restrict (uIoc α β)] fun x : ℝ => w x * |q x| := by
    rw [uIoc_of_le hαβ.le]
    have h : ∀ᵐ x ∂volume.restrict (Ioo α β), 0 ≤ w x * |q x| :=
      (ae_restrict_iff' measurableSet_Ioo).mpr
        (.of_forall fun x hx => mul_nonneg (hwpos x hx).le (abs_nonneg _))
    exact ae_restrict_of_ae_eq_of_ae_restrict Ioo_ae_eq_Ioc h
  have hwint : IntervalIntegrable (fun x : ℝ => w x * |q x|) volume α β :=
    (hw.mul hq.abs).intervalIntegrable_of_Icc hαβ.le
  rw [integral_pos_iff_support_of_nonneg_ae' hwnonneg hwint]
  refine ⟨hαβ, ?_⟩
  have hsubset : Function.support (fun x : ℝ => |q x|) ∩ Ioo α β ⊆
      Function.support (fun x : ℝ => w x * |q x|) ∩ Ioc α β := by
    rintro x ⟨hxq, hxIoo⟩
    refine ⟨?_, Ioo_subset_Ioc_self hxIoo⟩
    simp only [Function.mem_support, ne_eq, mul_eq_zero] at hxq ⊢
    push Not at hxq ⊢
    exact ⟨(hwpos x hxIoo).ne', hxq⟩
  have hmeq : volume (Function.support (fun x : ℝ => |q x|) ∩ Ioo α β) =
      volume (Function.support (fun x : ℝ => |q x|) ∩ Ioc α β) := by
    apply measure_congr
    filter_upwards [Ioo_ae_eq_Ioc (μ := volume) (a := α) (b := β)] with x hx
    simp only [mem_inter_iff, hx]
  calc 0 < volume (Function.support (fun x : ℝ => |q x|) ∩ Ioc α β) := hsuppA
    _ = volume (Function.support (fun x : ℝ => |q x|) ∩ Ioo α β) := hmeq.symm
    _ ≤ volume (Function.support (fun x : ℝ => w x * |q x|) ∩ Ioc α β) := measure_mono hsubset

-- Left half: zero at `a`, positive max at `c`, `u' c = 0`.
lemma left_bound (q u : ℝ → ℝ) (a c : ℝ) (hac : a < c)
    (hq : ContinuousOn q (Icc a c)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Ioo a c, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hderivc : deriv u c = 0) (hcpos : 0 < u c)
    (hmax : ∀ x ∈ Icc a c, |u x| ≤ u c) :
    1 < (c - a) * ∫ x in a..c, |q x| := by
  set M := u c
  set A := ∫ x in a..c, |q x|
  have hM : 0 < M := hcpos
  have hu1 : ContDiff ℝ 1 (deriv u) := (contDiff_succ_iff_deriv.mp hu).2.2
  have hud : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hud' : Differentiable ℝ (deriv u) := hu1.differentiable (by norm_num)
  have hudc : Continuous (deriv u) := hu1.continuous
  have hu''c : Continuous (deriv (deriv u)) := hu1.continuous_deriv (by norm_num)
  have hibp : ∫ x in a..c, (x - a) * deriv (deriv u) x = -∫ x in a..c, deriv u x := by
    have := integral_mul_deriv_eq_deriv_mul_of_hasDerivAt
      (u := fun x : ℝ => x - a) (v := deriv u) (u' := fun _ => (1 : ℝ))
      (v' := deriv (deriv u))
      (continuous_id.sub continuous_const).continuousOn hudc.continuousOn
      (fun x _ => (hasDerivAt_id x).sub_const a)
      (fun x _ => (hud' x).hasDerivAt)
      intervalIntegrable_const
      (hu''c.intervalIntegrable a c)
    simp only [sub_self, zero_mul, one_mul, hderivc, mul_zero, zero_sub] at this
    exact this
  have hftc : ∫ x in a..c, deriv u x = M := by
    rw [integral_deriv_eq_sub (fun x _ => hud x) (hudc.intervalIntegrable a c), ha]
    ring
  have hMeq : ∫ x in a..c, (x - a) * (q x * u x) = M := by
    have hcong : ∫ x in a..c, (x - a) * deriv (deriv u) x =
        ∫ x in a..c, (x - a) * (-(q x * u x)) := by
      apply integral_congr_Ioo_of_le hac.le
      intro x hx
      have hd : deriv (deriv u) x = -(q x * u x) := by linarith [hode x hx]
      simp [hd]
    have hneg : ∫ x in a..c, (x - a) * (-(q x * u x)) =
        -∫ x in a..c, (x - a) * (q x * u x) := by
      simp [intervalIntegral.integral_neg, mul_neg]
    linarith [hibp, hftc, hcong, hneg]
  have hMle : M ≤ M * ∫ x in a..c, (x - a) * |q x| := by
    have h : M ≤ ∫ x in a..c, (x - a) * |q x| * M :=
      calc M = |∫ x in a..c, (x - a) * (q x * u x)| := by rw [hMeq, abs_of_pos hM]
        _ ≤ ∫ x in a..c, |(x - a) * (q x * u x)| :=
          abs_integral_le_integral_abs hac.le
        _ ≤ ∫ x in a..c, (x - a) * |q x| * M := by
          apply integral_mono_on hac.le
          · exact (((continuous_id.sub continuous_const).continuousOn.mul
              (hq.mul hu.continuous.continuousOn)).abs).intervalIntegrable_of_Icc hac.le
          · exact (((continuous_id.sub continuous_const).continuousOn.mul hq.abs).mul
              continuous_const.continuousOn).intervalIntegrable_of_Icc hac.le
          · intro x hx
            have h1 : |(x - a) * (q x * u x)| = (x - a) * |q x| * |u x| := by
              rw [abs_mul, abs_mul, abs_of_nonneg (sub_nonneg.mpr hx.1)]
              ring
            rw [h1]
            exact mul_le_mul_of_nonneg_left (hmax x hx)
              (mul_nonneg (sub_nonneg.mpr hx.1) (abs_nonneg _))
    rw [intervalIntegral.integral_mul_const, mul_comm] at h
    exact h
  have hA0 : 0 < A := by
    by_contra h
    have hA : A = 0 := by
      have : 0 ≤ A := integral_nonneg hac.le (fun x _ => abs_nonneg _)
      linarith
    have hcle : ∫ x in a..c, (x - a) * |q x| ≤ (c - a) * A := by
      rw [show (c - a) * A = ∫ x in a..c, (c - a) * |q x| by
        simp only [A, intervalIntegral.integral_const_mul]]
      apply integral_mono_on hac.le
      · exact ((continuous_id.sub continuous_const).continuousOn.mul
          hq.abs).intervalIntegrable_of_Icc hac.le
      · exact (continuous_const.continuousOn.mul hq.abs).intervalIntegrable_of_Icc hac.le
      · intro x hx
        exact mul_le_mul_of_nonneg_right (by linarith [hx.2]) (abs_nonneg _)
    have : M ≤ 0 := by
      calc M ≤ M * ∫ x in a..c, (x - a) * |q x| := hMle
        _ ≤ M * ((c - a) * A) := by gcongr
        _ = 0 := by rw [hA]; ring
    linarith
  have hstrict : ∫ x in a..c, (x - a) * |q x| < (c - a) * A := by
    have hsplit : ∫ x in a..c, (x - a) * |q x| =
        (c - a) * A - ∫ x in a..c, (c - x) * |q x| := by
      have hfun : (fun x : ℝ => (x - a) * |q x|) =
          (fun x => (c - a) * |q x| - (c - x) * |q x|) := by
        funext x; ring
      rw [hfun, intervalIntegral.integral_sub]
      · simp only [A, intervalIntegral.integral_const_mul]
      · exact (continuous_const.continuousOn.mul hq.abs).intervalIntegrable_of_Icc hac.le
      · exact ((continuous_const.sub continuous_id).continuousOn.mul
          hq.abs).intervalIntegrable_of_Icc hac.le
    rw [hsplit]
    apply sub_lt_self
    exact integral_weight_pos hac (continuous_const.sub continuous_id).continuousOn
      (fun x hx => sub_pos.mpr hx.2) hq hA0
  have hlt : M < M * ((c - a) * A) := by
    calc M ≤ M * ∫ x in a..c, (x - a) * |q x| := hMle
      _ < M * ((c - a) * A) := by gcongr
  have : 1 < (c - a) * A := by
    by_contra h
    have hle : (c - a) * A ≤ 1 := by linarith
    have : M * ((c - a) * A) ≤ M := by
      calc M * ((c - a) * A) ≤ M * 1 := mul_le_mul_of_nonneg_left hle hM.le
        _ = M := by ring
    linarith
  exact this

-- Right half: positive max at `c`, zero at `b`, `u' c = 0`.
lemma right_bound (q u : ℝ → ℝ) (c b : ℝ) (hcb : c < b)
    (hq : ContinuousOn q (Icc c b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Ioo c b, deriv (deriv u) x + q x * u x = 0)
    (hb : u b = 0) (hderivc : deriv u c = 0) (hcpos : 0 < u c)
    (hmax : ∀ x ∈ Icc c b, |u x| ≤ u c) :
    1 < (b - c) * ∫ x in c..b, |q x| := by
  set M := u c
  set B := ∫ x in c..b, |q x|
  have hM : 0 < M := hcpos
  have hu1 : ContDiff ℝ 1 (deriv u) := (contDiff_succ_iff_deriv.mp hu).2.2
  have hud : Differentiable ℝ u := hu.differentiable (by norm_num)
  have hud' : Differentiable ℝ (deriv u) := hu1.differentiable (by norm_num)
  have hudc : Continuous (deriv u) := hu1.continuous
  have hu''c : Continuous (deriv (deriv u)) := hu1.continuous_deriv (by norm_num)
  have hibp : ∫ x in c..b, (b - x) * deriv (deriv u) x = ∫ x in c..b, deriv u x := by
    have := integral_mul_deriv_eq_deriv_mul_of_hasDerivAt
      (u := fun x : ℝ => b - x) (v := deriv u) (u' := fun _ => (-1 : ℝ))
      (v' := deriv (deriv u))
      (continuous_const.sub continuous_id).continuousOn hudc.continuousOn
      (fun x _ => (hasDerivAt_id x).const_sub b)
      (fun x _ => (hud' x).hasDerivAt)
      intervalIntegrable_const
      (hu''c.intervalIntegrable c b)
    simp only [sub_self, zero_mul, hderivc, mul_zero, neg_mul, one_mul,
      intervalIntegral.integral_neg, sub_neg_eq_add, zero_add] at this
    exact this
  have hftc : ∫ x in c..b, deriv u x = -M := by
    rw [integral_deriv_eq_sub (fun x _ => hud x) (hudc.intervalIntegrable c b), hb]
    ring
  have hMeq : ∫ x in c..b, (b - x) * (q x * u x) = M := by
    have hcong : ∫ x in c..b, (b - x) * deriv (deriv u) x =
        ∫ x in c..b, (b - x) * (-(q x * u x)) := by
      apply integral_congr_Ioo_of_le hcb.le
      intro x hx
      have hd : deriv (deriv u) x = -(q x * u x) := by linarith [hode x hx]
      simp [hd]
    have hneg : ∫ x in c..b, (b - x) * (-(q x * u x)) =
        -∫ x in c..b, (b - x) * (q x * u x) := by
      simp [intervalIntegral.integral_neg, mul_neg]
    linarith [hibp, hftc, hcong, hneg]
  have hMle : M ≤ M * ∫ x in c..b, (b - x) * |q x| := by
    have h : M ≤ ∫ x in c..b, (b - x) * |q x| * M :=
      calc M = |∫ x in c..b, (b - x) * (q x * u x)| := by rw [hMeq, abs_of_pos hM]
        _ ≤ ∫ x in c..b, |(b - x) * (q x * u x)| :=
          abs_integral_le_integral_abs hcb.le
        _ ≤ ∫ x in c..b, (b - x) * |q x| * M := by
          apply integral_mono_on hcb.le
          · exact (((continuous_const.sub continuous_id).continuousOn.mul
              (hq.mul hu.continuous.continuousOn)).abs).intervalIntegrable_of_Icc hcb.le
          · exact (((continuous_const.sub continuous_id).continuousOn.mul hq.abs).mul
              continuous_const.continuousOn).intervalIntegrable_of_Icc hcb.le
          · intro x hx
            have h1 : |(b - x) * (q x * u x)| = (b - x) * |q x| * |u x| := by
              rw [abs_mul, abs_mul, abs_of_nonneg (sub_nonneg.mpr hx.2)]
              ring
            rw [h1]
            exact mul_le_mul_of_nonneg_left (hmax x hx)
              (mul_nonneg (sub_nonneg.mpr hx.2) (abs_nonneg _))
    rw [intervalIntegral.integral_mul_const, mul_comm] at h
    exact h
  have hB0 : 0 < B := by
    by_contra h
    have hB : B = 0 := by
      have : 0 ≤ B := integral_nonneg hcb.le (fun x _ => abs_nonneg _)
      linarith
    have hcle : ∫ x in c..b, (b - x) * |q x| ≤ (b - c) * B := by
      rw [show (b - c) * B = ∫ x in c..b, (b - c) * |q x| by
        simp only [B, intervalIntegral.integral_const_mul]]
      apply integral_mono_on hcb.le
      · exact ((continuous_const.sub continuous_id).continuousOn.mul
          hq.abs).intervalIntegrable_of_Icc hcb.le
      · exact (continuous_const.continuousOn.mul hq.abs).intervalIntegrable_of_Icc hcb.le
      · intro x hx
        exact mul_le_mul_of_nonneg_right (by linarith [hx.1]) (abs_nonneg _)
    have : M ≤ 0 := by
      calc M ≤ M * ∫ x in c..b, (b - x) * |q x| := hMle
        _ ≤ M * ((b - c) * B) := by gcongr
        _ = 0 := by rw [hB]; ring
    linarith
  have hstrict : ∫ x in c..b, (b - x) * |q x| < (b - c) * B := by
    have hsplit : ∫ x in c..b, (b - x) * |q x| =
        (b - c) * B - ∫ x in c..b, (x - c) * |q x| := by
      have hfun : (fun x : ℝ => (b - x) * |q x|) =
          (fun x => (b - c) * |q x| - (x - c) * |q x|) := by
        funext x; ring
      rw [hfun, intervalIntegral.integral_sub]
      · simp only [B, intervalIntegral.integral_const_mul]
      · exact (continuous_const.continuousOn.mul hq.abs).intervalIntegrable_of_Icc hcb.le
      · exact ((continuous_id.sub continuous_const).continuousOn.mul
          hq.abs).intervalIntegrable_of_Icc hcb.le
    rw [hsplit]
    apply sub_lt_self
    exact integral_weight_pos hcb (continuous_id.sub continuous_const).continuousOn
      (fun x hx => sub_pos.mpr hx.1) hq hB0
  have hlt : M < M * ((b - c) * B) := by
    calc M ≤ M * ∫ x in c..b, (b - x) * |q x| := hMle
      _ < M * ((b - c) * B) := by gcongr
  have : 1 < (b - c) * B := by
    by_contra h
    have hle : (b - c) * B ≤ 1 := by linarith
    have : M * ((b - c) * B) ≤ M := by
      calc M * ((b - c) * B) ≤ M * 1 := mul_le_mul_of_nonneg_left hle hM.le
        _ = M := by ring
    linarith
  exact this

lemma combine_bound (q : ℝ → ℝ) (a b c : ℝ) (hab : a < b) (hcIoo : c ∈ Ioo a b)
    (hq : ContinuousOn q (Icc a b))
    (hL : 1 < (c - a) * ∫ x in a..c, |q x|)
    (hR : 1 < (b - c) * ∫ x in c..b, |q x|) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  set s := c - a
  set t := b - c
  set A := ∫ x in a..c, |q x|
  set B := ∫ x in c..b, |q x|
  have hs : 0 < s := sub_pos.mpr hcIoo.1
  have ht : 0 < t := sub_pos.mpr hcIoo.2
  have hsA : 1 < s * A := hL
  have htB : 1 < t * B := hR
  have hAn : 0 ≤ A := integral_nonneg (by linarith : a ≤ c) (fun x _ => abs_nonneg _)
  have hBn : 0 ≤ B := integral_nonneg (by linarith : c ≤ b) (fun x _ => abs_nonneg _)
  have hprod : 1 < (s * A) * (t * B) := by
    calc (1 : ℝ) = 1 * 1 := by ring
      _ < (s * A) * 1 := mul_lt_mul_of_pos_right hsA (by norm_num)
      _ < (s * A) * (t * B) := mul_lt_mul_of_pos_left htB (by linarith)
  have hamgm : 4 * (s * A * (t * B)) ≤ (s * B + t * A) ^ 2 := by
    have hre : s * A * (t * B) = s * B * (t * A) := by ring
    nlinarith [sq_nonneg (s * B - t * A)]
  have hsqgt : 4 < (s * B + t * A) ^ 2 := by nlinarith
  have hcross : 2 < s * B + t * A := by
    by_contra h
    have hle : s * B + t * A ≤ 2 := by linarith
    have hsqle : (s * B + t * A) ^ 2 ≤ 4 := by
      have : 0 ≤ s * B + t * A := by positivity
      nlinarith
    linarith
  have hfinal : 4 < (s + t) * (A + B) := by
    have hexpand : (s + t) * (A + B) = s * A + t * B + (s * B + t * A) := by ring
    rw [hexpand]
    nlinarith
  have hst' : s + t = b - a := by ring
  have hAB' : A + B = ∫ x in a..b, |q x| := by
    simp only [A, B]
    exact integral_add_adjacent_intervals
      ((hq.mono (Icc_subset_Icc (le_refl a) hcIoo.2.le)).abs.intervalIntegrable_of_Icc
        (by linarith))
      ((hq.mono (Icc_subset_Icc hcIoo.1.le (le_refl b))).abs.intervalIntegrable_of_Icc
        (by linarith))
  simpa [hst', hAB'] using hfinal

theorem problem1 (q u : ℝ → ℝ) (a b : ℝ) (hab : a < b)
    (hq : ContinuousOn q (Icc a b)) (hu : ContDiff ℝ 2 u)
    (hode : ∀ x ∈ Ioo a b, deriv (deriv u) x + q x * u x = 0)
    (ha : u a = 0) (hb : u b = 0) (hne : ∃ x ∈ Ioo a b, u x ≠ 0) :
    4 < (b - a) * ∫ x in a..b, |q x| := by
  have huc : Continuous u := hu.continuous
  obtain ⟨c, hcIcc, hcmax⟩ : ∃ c ∈ Icc a b, IsMaxOn (fun x => |u x|) (Icc a b) c :=
    isCompact_Icc.exists_isMaxOn (nonempty_Icc.mpr hab.le)
      (continuous_abs.comp huc).continuousOn
  set M := |u c|
  have hmax' : ∀ x ∈ Icc a b, |u x| ≤ M := by
    simpa [M] using isMaxOn_iff.mp hcmax
  have hMpos : 0 < M := by
    obtain ⟨x, hxIoo, hxne⟩ := hne
    exact lt_of_lt_of_le (abs_pos.mpr hxne) (hmax' x (Ioo_subset_Icc_self hxIoo))
  have hcIoo : c ∈ Ioo a b := by
    have hca : c ≠ a := by
      intro h
      have : M = 0 := by simp [M, h, ha]
      linarith
    have hcb : c ≠ b := by
      intro h
      have : M = 0 := by simp [M, h, hb]
      linarith
    exact ⟨lt_of_le_of_ne hcIcc.1 hca.symm, lt_of_le_of_ne hcIcc.2 hcb⟩
  have hsubL : Icc a c ⊆ Icc a b := Icc_subset_Icc (le_refl a) hcIoo.2.le
  have hsubR : Icc c b ⊆ Icc a b := Icc_subset_Icc hcIoo.1.le (le_refl b)
  have hqL : ContinuousOn q (Icc a c) := hq.mono hsubL
  have hqR : ContinuousOn q (Icc c b) := hq.mono hsubR
  have hodeL : ∀ x ∈ Ioo a c, deriv (deriv u) x + q x * u x = 0 :=
    fun x hx => hode x (Ioo_subset_Ioo (le_refl a) hcIoo.2.le hx)
  have hodeR : ∀ x ∈ Ioo c b, deriv (deriv u) x + q x * u x = 0 :=
    fun x hx => hode x (Ioo_subset_Ioo hcIoo.1.le (le_refl b) hx)
  by_cases hsign : 0 ≤ u c
  · have hucM : u c = M := (abs_of_nonneg hsign).symm
    have hcpos : 0 < u c := by linarith
    have hderivc : deriv u c = 0 := by
      apply IsLocalMax.deriv_eq_zero
      filter_upwards [Icc_mem_nhds hcIoo.1 hcIoo.2] with x hx
      calc u x ≤ |u x| := le_abs_self (u x)
        _ ≤ M := hmax' x hx
        _ = u c := hucM.symm
    have hL : 1 < (c - a) * ∫ x in a..c, |q x| :=
      left_bound q u a c hcIoo.1 hqL hu hodeL ha hderivc hcpos
        (fun x hx => by simpa [hucM] using hmax' x (hsubL hx))
    have hR : 1 < (b - c) * ∫ x in c..b, |q x| :=
      right_bound q u c b hcIoo.2 hqR hu hodeR hb hderivc hcpos
        (fun x hx => by simpa [hucM] using hmax' x (hsubR hx))
    exact combine_bound q a b c hab hcIoo hq hL hR
  · have hucneg : u c < 0 := by linarith
    have hnegc : -u c = M := by
      have : |u c| = -u c := abs_of_neg hucneg
      linarith
    have hcpos : 0 < -u c := by linarith
    have hderivc : deriv (-u) c = 0 := by
      apply IsLocalMax.deriv_eq_zero
      filter_upwards [Icc_mem_nhds hcIoo.1 hcIoo.2] with x hx
      calc -u x ≤ |-u x| := le_abs_self (-u x)
        _ = |u x| := abs_neg (u x)
        _ ≤ M := hmax' x hx
        _ = -u c := hnegc.symm
    have hode_neg : ∀ x ∈ Ioo a b, deriv (deriv (-u)) x + q x * (-u) x = 0 := by
      intro x hx
      have hd2 : deriv (deriv (-u)) x = -deriv (deriv u) x := by
        have hd1 : deriv (-u) = -deriv u := by funext x; exact deriv.neg
        rw [hd1]
        exact deriv.neg
      have := hode x hx
      simp only [Pi.neg_apply, hd2, mul_neg]
      linarith
    have hL : 1 < (c - a) * ∫ x in a..c, |q x| :=
      left_bound q (-u) a c hcIoo.1 hqL hu.neg
        (fun x hx => hode_neg x (Ioo_subset_Ioo (le_refl a) hcIoo.2.le hx))
        (by simp [ha]) hderivc hcpos
        (fun x hx => by
          have := hmax' x (hsubL hx)
          simpa [abs_neg, hnegc] using this)
    have hR : 1 < (b - c) * ∫ x in c..b, |q x| :=
      right_bound q (-u) c b hcIoo.2 hqR hu.neg
        (fun x hx => hode_neg x (Ioo_subset_Ioo hcIoo.1.le (le_refl b) hx))
        (by simp [hb]) hderivc hcpos
        (fun x hx => by
          have := hmax' x (hsubR hx)
          simpa [abs_neg, hnegc] using this)
    exact combine_bound q a b c hab hcIoo hq hL hR

#print axioms problem1
