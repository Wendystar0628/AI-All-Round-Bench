import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Polynomial.Splits

namespace Problem3Aux

open Polynomial Finset

lemma sum_inv_nine_pow_lt : ∀ m : ℕ, ∑ j ∈ range m, ((1 / 9 : ℝ) ^ j) < 9 / 8
  | 0 => by norm_num
  | m + 1 => by
    rw [Finset.sum_range_succ']
    have ih := sum_inv_nine_pow_lt m
    have hmul : ∑ j ∈ range m, ((1 / 9 : ℝ) ^ (j + 1)) =
        (1 / 9 : ℝ) * ∑ j ∈ range m, ((1 / 9 : ℝ) ^ j) := by
      rw [Finset.mul_sum]
      refine Finset.sum_congr rfl fun j _ => by ring
    rw [hmul, pow_zero]
    linarith

lemma multiset_norm_prod_gt_one :
    ∀ m : Multiset ℂ, m ≠ 0 → (∀ z ∈ m, 1 < ‖z‖) → 1 < ‖m.prod‖ := by
  intro m
  induction m using Multiset.induction_on with
  | empty => intro h; exact absurd rfl h
  | @cons a s ih =>
    intro _ hall
    rw [Multiset.prod_cons, norm_mul]
    have ha : 1 < ‖a‖ := hall a (Multiset.mem_cons_self a s)
    by_cases hs : s = 0
    · rw [hs, Multiset.prod_zero, norm_one, mul_one]
      exact ha
    · have hs1 : 1 < ‖s.prod‖ := ih hs (fun z hz => hall z (Multiset.mem_cons_of_mem hz))
      nlinarith

lemma root_dist_ten_gt_one (f : ℤ[X]) (hf : f ≠ 0)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (z : ℂ) (hz : (f.map (Int.castRingHom ℂ)).eval z = 0) :
    1 < ‖(10 : ℂ) - z‖ := by
  by_contra hle
  push Not at hle
  have hz_re : 9 ≤ z.re := by
    have h1 : ((10 : ℂ) - z).re ≤ ‖(10 : ℂ) - z‖ := Complex.re_le_norm _
    simp only [Complex.sub_re, Complex.re_ofNat] at h1
    linarith
  have hz_norm : 9 ≤ ‖z‖ := hz_re.trans (Complex.re_le_norm z)
  have hz_ne : z ≠ 0 := by
    intro h0
    rw [h0, norm_zero] at hz_norm
    linarith
  have hinv_re : 0 ≤ (z⁻¹).re := by
    have hmul : z * z⁻¹ = 1 := mul_inv_cancel₀ hz_ne
    have hre : z.re * (z⁻¹).re - z.im * (z⁻¹).im = 1 := by
      have := congr_arg Complex.re hmul
      simpa [Complex.mul_re] using this
    have him : z.re * (z⁻¹).im + z.im * (z⁻¹).re = 0 := by
      have := congr_arg Complex.im hmul
      simpa [Complex.mul_im] using this
    have hsq : (z.re ^ 2 + z.im ^ 2) * (z⁻¹).re = z.re := by
      linear_combination z.re * hre + z.im * him
    have hpos : 0 < z.re ^ 2 + z.im ^ 2 := by nlinarith
    nlinarith
  set n := f.natDegree
  have hlead_int : 1 ≤ f.coeff n := by
    have hne : f.coeff n ≠ 0 := leadingCoeff_ne_zero.mpr hf
    have hge : 0 ≤ f.coeff n := (hdigit n).1
    omega
  have hlead_real : (1 : ℝ) ≤ (f.coeff n : ℝ) := by exact_mod_cast hlead_int
  have heval : ∑ k ∈ range (n + 1), (f.coeff k : ℂ) * z ^ k = 0 := by
    rw [eval_map, eval₂_eq_sum_range] at hz
    simpa [n] using hz
  by_cases hn0 : n = 0
  · rw [hn0] at heval hlead_real
    simp only [Nat.zero_add, range_one, sum_singleton, pow_zero, mul_one] at heval
    have hre := congr_arg Complex.re heval
    simp only [Complex.intCast_re, Complex.zero_re] at hre
    linarith
  by_cases hn1 : n = 1
  · rw [hn1] at heval hlead_real
    simp only [Finset.sum_range_succ, range_zero, sum_empty, zero_add, pow_zero, mul_one,
      pow_one] at heval
    have hre := congr_arg Complex.re heval
    simp only [Complex.add_re, Complex.mul_re, Complex.intCast_re, Complex.intCast_im,
      zero_mul, sub_zero, Complex.zero_re] at hre
    have hc0 : (0 : ℝ) ≤ (f.coeff 0 : ℝ) := by exact_mod_cast (hdigit 0).1
    nlinarith
  have hn2 : 2 ≤ n := by omega
  -- Divide heval by z^n
  have hdiv : ∑ k ∈ range (n + 1), (f.coeff k : ℂ) * z⁻¹ ^ (n - k) = 0 := by
    have h0 : (∑ k ∈ range (n + 1), (f.coeff k : ℂ) * z ^ k) * (z ^ n)⁻¹ = 0 := by
      rw [heval, zero_mul]
    rw [Finset.sum_mul] at h0
    rw [← h0]
    refine Finset.sum_congr rfl fun k hk => ?_
    have hk_le : k ≤ n := Nat.lt_succ_iff.mp (mem_range.mp hk)
    rw [mul_assoc]
    congr 1
    have hzn : z ^ n = z ^ k * z ^ (n - k) := by rw [← pow_add, Nat.add_sub_cancel' hk_le]
    rw [hzn, mul_inv, ← mul_assoc, mul_inv_cancel₀ (pow_ne_zero k hz_ne), one_mul, inv_pow]
  -- Split off k = n and k = n - 1
  have hsplit : (f.coeff n : ℂ) + (f.coeff (n - 1) : ℂ) * z⁻¹ +
      ∑ k ∈ range (n - 1), (f.coeff k : ℂ) * z⁻¹ ^ (n - k) = 0 := by
    have h1 : n - 1 + 1 = n := Nat.sub_add_cancel (by omega)
    rw [Finset.sum_range_succ, ← h1, Finset.sum_range_succ] at hdiv
    simp only [h1, Nat.sub_self, pow_zero, mul_one] at hdiv
    have hsub1 : n - (n - 1) = 1 := by omega
    rw [hsub1, pow_one] at hdiv
    linear_combination hdiv
  set T : ℂ := ∑ k ∈ range (n - 1), (f.coeff k : ℂ) * z⁻¹ ^ (n - k)
  have hre_eq : (f.coeff n : ℝ) + (f.coeff (n - 1) : ℝ) * (z⁻¹).re + T.re = 0 := by
    have := congr_arg Complex.re hsplit
    simpa [T, Complex.add_re, Complex.mul_re] using this
  have hterm1 : 0 ≤ (f.coeff (n - 1) : ℝ) * (z⁻¹).re :=
    mul_nonneg (by exact_mod_cast (hdigit (n - 1)).1) hinv_re
  -- Bound ‖T‖ < 1/8 < 1
  have hT_norm : ‖T‖ < 1 := by
    have h1 : ‖T‖ ≤ ∑ k ∈ range (n - 1), ‖(f.coeff k : ℂ) * z⁻¹ ^ (n - k)‖ :=
      norm_sum_le _ _
    have h2 : ∑ k ∈ range (n - 1), ‖(f.coeff k : ℂ) * z⁻¹ ^ (n - k)‖ ≤
        ∑ k ∈ range (n - 1), 9 * (1 / 9 : ℝ) ^ (n - k) := by
      refine Finset.sum_le_sum fun k _ => ?_
      rw [norm_mul, norm_pow, norm_inv]
      have hc_le : ‖(f.coeff k : ℂ)‖ ≤ 9 := by
        rw [Complex.norm_intCast]
        have hlo : (0 : ℝ) ≤ (f.coeff k : ℝ) := by exact_mod_cast (hdigit k).1
        have hhi : (f.coeff k : ℝ) ≤ 9 := by exact_mod_cast (hdigit k).2
        rw [abs_of_nonneg hlo]
        exact hhi
      have hz_inv : ‖z‖⁻¹ ≤ (1 / 9 : ℝ) := by
        rw [one_div]
        exact inv_anti₀ (by norm_num) hz_norm
      have hpow : ‖z‖⁻¹ ^ (n - k) ≤ (1 / 9 : ℝ) ^ (n - k) :=
        pow_le_pow_left₀ (inv_nonneg.mpr (norm_nonneg z)) hz_inv (n - k)
      exact mul_le_mul hc_le hpow (pow_nonneg (inv_nonneg.mpr (norm_nonneg z)) _) (by norm_num)
    have h3 : ∑ k ∈ range (n - 1), 9 * (1 / 9 : ℝ) ^ (n - k) =
        (1 / 9 : ℝ) * ∑ j ∈ range (n - 1), (1 / 9 : ℝ) ^ j := by
      rw [Finset.mul_sum, ← Finset.sum_range_reflect (fun j => (1 / 9 : ℝ) * (1 / 9 : ℝ) ^ j) (n - 1)]
      refine Finset.sum_congr rfl fun k hk => ?_
      have hk_lt : k < n - 1 := mem_range.mp hk
      have hexp : n - k = (n - 1 - 1 - k) + 2 := by omega
      rw [hexp, pow_add]
      ring
    have h4 := sum_inv_nine_pow_lt (n - 1)
    linarith
  have hT_re : -1 < T.re := by
    have h1 : |T.re| ≤ ‖T‖ := Complex.abs_re_le_norm T
    have h2 : -‖T‖ ≤ T.re := neg_le_of_abs_le h1
    linarith
  linarith

end Problem3Aux

open Problem3Aux

open Polynomial in
theorem problem3 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf0 : f ≠ 0 := by
    intro h0
    rw [h0, eval_zero] at hp
    exact hp.ne_zero rfl
  have hnot_unit : ¬ IsUnit f := by
    intro hu
    exact hp.not_isUnit (hu.map (evalRingHom 10))
  have hdvd_unit : ∀ q : ℤ[X], q ∣ f → IsUnit (q.eval 10) → IsUnit q := by
    intro q hqf hqu
    have hq0 : q ≠ 0 := fun h0 => hf0 (zero_dvd_iff.mp (h0 ▸ hqf))
    by_cases hdeg0 : q.natDegree = 0
    · have hqC : q = C (q.coeff 0) := eq_C_of_natDegree_eq_zero hdeg0
      have hev : q.eval 10 = q.coeff 0 := by
        conv_lhs => rw [hqC]
        exact eval_C
      rw [hev] at hqu
      rw [hqC]
      exact hqu.map C
    · exfalso
      have hdeg_pos : 1 ≤ q.natDegree := Nat.pos_of_ne_zero hdeg0
      set qC : ℂ[X] := q.map (Int.castRingHom ℂ)
      set fC : ℂ[X] := f.map (Int.castRingHom ℂ)
      have hqC_deg : qC.natDegree = q.natDegree :=
        natDegree_map_eq_of_injective Int.cast_injective _
      have hqC_splits : qC.Splits := IsAlgClosed.splits qC
      have hqC_eval : qC.eval 10 = qC.leadingCoeff * (qC.roots.map ((10 : ℂ) - ·)).prod :=
        hqC_splits.eval_eq_prod_roots 10
      have hqC_eval10 : ‖qC.eval 10‖ = 1 := by
        have heq : qC.eval 10 = (Int.castRingHom ℂ) (q.eval 10) := by
          dsimp [qC]
          rw [eval_map]
          simpa using (Polynomial.hom_eval₂ q (RingHom.id ℤ) (Int.castRingHom ℂ) (10 : ℤ)).symm
        rw [heq, Int.coe_castRingHom, Complex.norm_intCast]
        rcases Int.isUnit_iff.mp hqu with h1 | h1 <;> simp [h1]
      have hqC_lc : (1 : ℝ) ≤ ‖qC.leadingCoeff‖ := by
        have hlc : qC.leadingCoeff = (q.leadingCoeff : ℂ) := by
          dsimp [qC]
          rw [leadingCoeff_map_of_injective Int.cast_injective]
          rfl
        rw [hlc, Complex.norm_intCast]
        have hne : q.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr hq0
        have habs : (1 : ℤ) ≤ |q.leadingCoeff| := Int.one_le_abs hne
        exact_mod_cast habs
      have hroots_ne : qC.roots ≠ 0 := by
        intro h0
        have hcard := hqC_splits.natDegree_eq_card_roots
        rw [h0, Multiset.card_zero, hqC_deg] at hcard
        omega
      have hroots_gt : ∀ z ∈ qC.roots, 1 < ‖(10 : ℂ) - z‖ := by
        intro z hz
        have hqC_ne : qC ≠ 0 := by
          intro h0
          rw [h0, natDegree_zero] at hqC_deg
          omega
        have hqz : qC.eval z = 0 := (mem_roots hqC_ne).mp hz
        obtain ⟨r, rfl⟩ := hqf
        have hfz : fC.eval z = 0 := by
          dsimp [fC]
          rw [Polynomial.map_mul, eval_mul]
          change qC.eval z * _ = 0
          rw [hqz, zero_mul]
        exact root_dist_ten_gt_one (q * r) hf0 hdigit z hfz
      have hprod_gt : 1 < ‖(qC.roots.map ((10 : ℂ) - ·)).prod‖ := by
        apply multiset_norm_prod_gt_one
        · simpa using hroots_ne
        · intro w hw
          rcases Multiset.mem_map.mp hw with ⟨z, hz, rfl⟩
          exact hroots_gt z hz
      have hnorm := congr_arg norm hqC_eval
      rw [norm_mul, hqC_eval10] at hnorm
      nlinarith
  refine ⟨hnot_unit, fun g h hgh => ?_⟩
  have heval_mul : f.eval 10 = g.eval 10 * h.eval 10 := by
    rw [hgh, eval_mul]
  rcases hp.irreducible.isUnit_or_isUnit heval_mul with hg | hh
  · left; exact hdvd_unit g ⟨h, hgh⟩ hg
  · right; exact hdvd_unit h ⟨g, by rw [mul_comm]; exact hgh⟩ hh
