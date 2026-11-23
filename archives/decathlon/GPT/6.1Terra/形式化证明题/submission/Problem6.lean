import Mathlib.Algebra.Polynomial.Eval.Defs
import Mathlib.RingTheory.Polynomial.Basic
import Mathlib.Algebra.Polynomial.RingDivision
import Mathlib.Algebra.Polynomial.Degree.SmallDegree
import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Analysis.Normed.Group.Int
import Mathlib.Algebra.Order.BigOperators.GroupWithZero.Multiset
import Mathlib.Analysis.SpecificLimits.Basic
import Mathlib.Algebra.Polynomial.Reverse
import Mathlib.Tactic

open Polynomial

lemma irreducible_of_prime_eval_and_units (f : ℤ[X]) (hp : Prime (f.eval 10))
    (hunit : ∀ g : ℤ[X], g ∣ f → IsUnit (g.eval 10) → IsUnit g) :
    Irreducible f := by
  refine ⟨?_, ?_⟩
  · intro hf
    exact hp.not_isUnit (hf.map (evalRingHom 10))
  · intro a b hab
    have heval : f.eval 10 = a.eval 10 * b.eval 10 := by
      simpa using congrArg (eval 10) hab
    have hprime := hp.irreducible
    rcases hprime.isUnit_or_isUnit heval with ha | hb
    · left
      exact hunit a (by exact ⟨b, hab⟩) ha
    · right
      exact hunit b (by exact ⟨a, by rw [hab, mul_comm]⟩) hb

lemma irreducible_of_prime_eval_of_natDegree_eq_zero (f : ℤ[X])
    (hp : Prime (f.eval 10)) (hdegree : f.natDegree = 0) : Irreducible f := by
  rw [eq_C_of_natDegree_eq_zero hdegree] at hp ⊢
  simp only [eval_C] at hp
  exact (Polynomial.prime_C_iff.mpr hp).irreducible

lemma irreducible_digit_linear (a b : ℤ) (ha : 0 < a) (hb : 0 ≤ b)
    (hp : Prime (10 * a + b)) : Irreducible (C a * X + C b) := by
  apply irreducible_C_mul_X_add_C (ne_of_gt ha)
  intro d hda hdb
  have hdp : d ∣ 10 * a + b := dvd_add (dvd_mul_of_dvd_right hda 10) hdb
  rcases hp.irreducible.dvd_iff.mp hdp with hd | hd
  · exact hd
  · have hpa : 10 * a + b ∣ a := dvd_trans hd.dvd hda
    have hle : 10 * a + b ≤ a := Int.le_of_dvd ha hpa
    omega

lemma irreducible_digit_degree_le_one (f : ℤ[X])
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) (hdegree : f.natDegree ≤ 1) : Irreducible f := by
  by_cases h0 : f.natDegree = 0
  · exact irreducible_of_prime_eval_of_natDegree_eq_zero f hp h0
  · have h1 : f.natDegree = 1 := by omega
    have hf0 : f ≠ 0 := by
      intro hf
      simp [hf] at h1
    have hc : f.coeff 1 ≠ 0 := by
      rw [← h1]
      exact leadingCoeff_ne_zero.mpr hf0
    have hpos : 0 < f.coeff 1 := lt_of_le_of_ne (hdigit 1).1 (Ne.symm hc)
    have heq := eq_X_add_C_of_natDegree_le_one hdegree
    rw [heq] at hp ⊢
    simp only [eval_add, eval_mul, eval_C, eval_X] at hp
    apply irreducible_digit_linear _ _ hpos (hdigit 0).1
    simpa [mul_comm] using hp

lemma unit_of_roots_far (g : ℤ[X]) (hg : g ≠ 0)
    (hroot : ∀ z : ℂ, (g.map (Int.castRingHom ℂ)).IsRoot z → 1 < ‖(10 : ℂ) - z‖)
    (hu : IsUnit (g.eval 10)) : IsUnit g := by
  classical
  have hι : Function.Injective (Int.castRingHom ℂ) := Int.cast_injective
  let q : ℂ[X] := g.map (Int.castRingHom ℂ)
  have hq : q ≠ 0 := (Polynomial.map_ne_zero_iff Int.cast_injective).2 hg
  have hlc : 1 ≤ ‖q.leadingCoeff‖ := by
    have h := Int.one_le_abs (leadingCoeff_ne_zero.mpr hg)
    have : (1 : ℝ) ≤ |((g.leadingCoeff : ℤ) : ℝ)| := by exact_mod_cast h
    simpa [q, leadingCoeff_map_of_injective hι, Complex.norm_intCast] using this
  have heval : ‖q.eval 10‖ = 1 := by
    rcases Int.isUnit_iff.mp hu with hu | hu <;>
      simp [q, eval_map, hu]
  have hroots : q.roots = 0 := by
    by_contra hr
    obtain ⟨z, hz⟩ := Multiset.exists_mem_of_ne_zero hr
    obtain ⟨rest, hrest⟩ := Multiset.exists_cons_of_mem hz
    have hd : 1 < ‖(10 : ℂ) - z‖ := hroot z ((mem_roots hq).mp hz)
    have hrest' : ∀ w ∈ rest, 1 ≤ ‖(10 : ℂ) - w‖ := by
      intro w hw
      apply le_of_lt
      apply hroot w
      apply (mem_roots hq).mp
      rw [hrest]
      simp [hw]
    have hprod : 1 ≤ (rest.map fun w => ‖(10 : ℂ) - w‖).prod :=
      Multiset.one_le_prod_map hrest'
    have hnorm := congrArg norm ((IsAlgClosed.splits q).eval_eq_prod_roots 10)
    rw [norm_mul, Multiset.norm_prod_map, hrest, Multiset.map_cons, Multiset.prod_cons] at hnorm
    rw [heval] at hnorm
    nlinarith [mul_nonneg (show 0 ≤ ‖(10 : ℂ) - z‖ by positivity) (sub_nonneg.mpr hprod),
      mul_nonneg (sub_nonneg.mpr hlc)
        (show 0 ≤ ‖(10 : ℂ) - z‖ * (rest.map fun w => ‖(10 : ℂ) - w‖).prod by positivity)]
  have hdegree : g.natDegree = 0 := by
    have h := (IsAlgClosed.splits q).natDegree_eq_card_roots
    rw [hroots] at h
    simpa [q, natDegree_map_eq_of_injective hι] using h
  rw [eq_C_of_natDegree_eq_zero hdegree] at hu ⊢
  simp only [eval_C] at hu
  exact isUnit_C.mpr hu

lemma irreducible_of_prime_eval_and_roots_far (f : ℤ[X]) (hp : Prime (f.eval 10))
    (hroot : ∀ z : ℂ, (f.map (Int.castRingHom ℂ)).IsRoot z → 1 < ‖(10 : ℂ) - z‖) :
    Irreducible f := by
  refine irreducible_of_prime_eval_and_units f hp ?_
  intro g hgf hu
  have hg : g ≠ 0 := by
    intro hg
    simp [hg] at hu
  refine unit_of_roots_far g hg ?_ hu
  intro z hz
  apply hroot z
  exact hz.dvd (Polynomial.map_dvd (Int.castRingHom ℂ) hgf)

lemma bounded_digit_eval (g : ℤ[X]) (w : ℂ)
    (hc : ∀ n, 0 ≤ g.coeff n ∧ g.coeff n ≤ 9) (hw : ‖w‖ ≤ 1 / 2) :
    ‖g.eval₂ (Int.castRingHom ℂ) w‖ ≤ 18 := by
  rw [eval₂_eq_sum_range]
  calc
    ‖∑ i ∈ Finset.range (g.natDegree + 1),
        (Int.castRingHom ℂ) (g.coeff i) * w ^ i‖
      ≤ ∑ i ∈ Finset.range (g.natDegree + 1),
          ‖(Int.castRingHom ℂ) (g.coeff i) * w ^ i‖ := norm_sum_le _ _
    _ ≤ ∑ i ∈ Finset.range (g.natDegree + 1), 9 * (1 / (2 : ℝ)) ^ i := by
      apply Finset.sum_le_sum
      intro i hi
      rw [norm_mul, norm_pow]
      have hc' : ‖(Int.castRingHom ℂ) (g.coeff i)‖ ≤ 9 := by
        have hi' : |g.coeff i| ≤ 9 := abs_le.mpr ⟨by linarith [(hc i).1], (hc i).2⟩
        have hreal : |((g.coeff i : ℤ) : ℝ)| ≤ 9 := by exact_mod_cast hi'
        simpa [Complex.norm_intCast] using hreal
      have hp : ‖w‖ ^ i ≤ (1 / (2 : ℝ)) ^ i :=
        pow_le_pow_left₀ (norm_nonneg _) hw i
      exact mul_le_mul hc' hp (pow_nonneg (norm_nonneg _) _) (by norm_num)
    _ = 9 * ∑ i ∈ Finset.range (g.natDegree + 1), (1 / (2 : ℝ)) ^ i := by
      rw [Finset.mul_sum]
    _ ≤ 18 := by
      have h := sum_geometric_two_le (g.natDegree + 1)
      linarith

lemma digit_eval_ne_zero_of_small_norm (g : ℤ[X]) (w : ℂ)
    (hc : ∀ n, 0 ≤ g.coeff n ∧ g.coeff n ≤ 9)
    (h0 : 1 ≤ g.coeff 0) (hw : ‖w‖ ≤ 1 / 9) (hwre : 0 ≤ w.re) :
    g.eval₂ (Int.castRingHom ℂ) w ≠ 0 := by
  have hc2 : ∀ n, 0 ≤ g.divX.divX.coeff n ∧ g.divX.divX.coeff n ≤ 9 := by
    intro n
    simpa only [coeff_divX] using hc (n + 1 + 1)
  have htail : ‖g.divX.divX.eval₂ (Int.castRingHom ℂ) w‖ ≤ 18 :=
    bounded_digit_eval _ _ hc2 (by linarith)
  have h1 := congrArg (fun q : ℤ[X] => q.eval₂ (Int.castRingHom ℂ) w)
    (X_mul_divX_add g)
  have h2 := congrArg (fun q : ℤ[X] => q.eval₂ (Int.castRingHom ℂ) w)
    (X_mul_divX_add g.divX)
  simp only [eval₂_add, eval₂_mul, eval₂_X, eval₂_C, coeff_divX] at h1 h2
  have hdecomp : g.eval₂ (Int.castRingHom ℂ) w =
      (g.coeff 0 : ℂ) + (g.coeff 1 : ℂ) * w +
        w ^ 2 * g.divX.divX.eval₂ (Int.castRingHom ℂ) w := by
    rw [← h1, ← h2]
    change w * (w * _ + (g.coeff 1 : ℂ)) + (g.coeff 0 : ℂ) = _
    ring
  have hsmall : ‖w ^ 2 * g.divX.divX.eval₂ (Int.castRingHom ℂ) w‖ ≤ (2 / 9 : ℝ) := by
    rw [norm_mul, norm_pow]
    have hw2 : ‖w‖ ^ 2 ≤ (1 / (9 : ℝ)) ^ 2 :=
      pow_le_pow_left₀ (norm_nonneg _) hw 2
    calc
      ‖w‖ ^ 2 * ‖g.divX.divX.eval₂ (Int.castRingHom ℂ) w‖
          ≤ (1 / (9 : ℝ)) ^ 2 * 18 :=
        mul_le_mul hw2 htail (norm_nonneg _) (by positivity)
      _ = 2 / 9 := by norm_num
  have hreal := Complex.abs_re_le_norm (w ^ 2 * g.divX.divX.eval₂ (Int.castRingHom ℂ) w)
  have hreal' : -(2 / 9 : ℝ) ≤ (w ^ 2 * g.divX.divX.eval₂ (Int.castRingHom ℂ) w).re := by
    have := (abs_le.mp (le_trans hreal hsmall)).1
    linarith
  have h0r : (1 : ℝ) ≤ (g.coeff 0 : ℝ) := by exact_mod_cast h0
  have h1r : (0 : ℝ) ≤ (g.coeff 1 : ℝ) := by exact_mod_cast (hc 1).1
  have hm : 0 ≤ (g.coeff 1 : ℝ) * w.re := mul_nonneg h1r hwre
  intro hz
  rw [hz] at hdecomp
  have hh := congrArg Complex.re hdecomp
  have hmre : ((g.coeff 1 : ℂ) * w).re = (g.coeff 1 : ℝ) * w.re := by simp
  simp only [Complex.zero_re, Complex.add_re, Complex.intCast_re, hmre] at hh
  linarith

lemma digit_roots_far (f : ℤ[X]) (hf : f ≠ 0)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (z : ℂ) (hz : (f.map (Int.castRingHom ℂ)).IsRoot z) :
    1 < ‖(10 : ℂ) - z‖ := by
  by_contra! hdist
  have hz9 : 9 ≤ ‖z‖ := by
    have h := norm_add_le ((10 : ℂ) - z) z
    simp only [sub_add_cancel] at h
    norm_num at h
    linarith
  have hz0 : z ≠ 0 := by
    intro heq
    norm_num [heq] at hz9
  have hzre : 0 ≤ z.re := by
    have h := (abs_le.mp ((Complex.abs_re_le_norm ((10 : ℂ) - z)).trans hdist)).2
    simp only [Complex.sub_re] at h
    norm_num at h
    linarith
  have hinvre : 0 ≤ (z⁻¹).re := by
    rw [Complex.inv_re]
    exact div_nonneg hzre (Complex.normSq_nonneg z)
  have hinv : ‖z⁻¹‖ ≤ 1 / 9 := by
    rw [norm_inv]
    simpa only [one_div] using one_div_le_one_div_of_le (by norm_num : (0 : ℝ) < 9) hz9
  have hrev : ∀ n, 0 ≤ f.reverse.coeff n ∧ f.reverse.coeff n ≤ 9 := by
    intro n
    rw [coeff_reverse]
    exact hdigit _
  have hpos : 1 ≤ f.reverse.coeff 0 := by
    rw [coeff_zero_reverse]
    have hnonneg := (hdigit f.natDegree).1
    have hne := leadingCoeff_ne_zero.mpr hf
    change 0 ≤ f.leadingCoeff at hnonneg
    omega
  have hne := digit_eval_ne_zero_of_small_norm f.reverse z⁻¹ hrev hpos hinv hinvre
  have hzval : f.eval₂ (Int.castRingHom ℂ) z = 0 := by
    simpa only [Polynomial.IsRoot, eval_map] using hz
  letI : Invertible z := invertibleOfNonzero hz0
  have heval := eval₂_reverse_mul_pow (Int.castRingHom ℂ) z f
  simp only [invOf_eq_inv, hzval] at heval
  exact hne ((mul_eq_zero.mp heval).resolve_right (pow_ne_zero _ hz0))

open Polynomial in
theorem problem6 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  apply irreducible_of_prime_eval_and_roots_far f hp
  have hf : f ≠ 0 := by
    intro heq
    apply hp.ne_zero
    simp [heq]
  exact digit_roots_far f hf hdigit