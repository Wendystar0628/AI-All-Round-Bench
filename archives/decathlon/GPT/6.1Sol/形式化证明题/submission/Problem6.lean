import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Polynomial.Eval.Irreducible
import Mathlib.Data.Int.Order.Units
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Ring
import Mathlib.Tactic.GCongr
import Mathlib.Tactic.Positivity
import Mathlib.Tactic.LinearCombination

open Polynomial

private lemma digit_sum_bound (R : ℝ) (hR : 9 ≤ R) (k : ℕ) :
    (∑ i ∈ Finset.range k, (9 : ℝ) * R ^ i) ≤ 2 * R ^ k := by
  induction k with
  | zero => simp
  | succ k ih =>
    rw [Finset.sum_range_succ, pow_succ]
    have hpow : 0 ≤ R ^ k := pow_nonneg (by linarith) _
    nlinarith

private lemma digit_linear_norm (a b : ℤ) (ha : 0 ≤ a) (hb : 1 ≤ b)
    (z : ℂ) (hz : 0 ≤ z.re) :
    ‖z‖ ≤ ‖(a : ℂ) + (b : ℂ) * z‖ := by
  have ha' : (0 : ℝ) ≤ a := by exact_mod_cast ha
  have hb' : (1 : ℝ) ≤ b := by exact_mod_cast hb
  have hs := Complex.normSq_nonneg z
  rw [← sq_le_sq₀ (norm_nonneg _) (norm_nonneg _),
    ← Complex.normSq_eq_norm_sq, ← Complex.normSq_eq_norm_sq]
  simp only [Complex.normSq_apply, Complex.add_re, Complex.add_im, Complex.mul_re,
    Complex.mul_im, Complex.intCast_re, Complex.intCast_im, zero_mul,
    sub_zero, zero_add]
  have h1 : 0 ≤ (a : ℝ) * (b : ℝ) * z.re := by positivity
  have h2 : 0 ≤ ((b : ℝ) ^ 2 - 1) * (z.re ^ 2 + z.im ^ 2) :=
    mul_nonneg (by nlinarith) (by positivity)
  nlinarith [sq_nonneg (a : ℝ)]

private lemma digit_no_root (f : ℤ[X])
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf : f ≠ 0)
    (z : ℂ) (hzr : 0 ≤ z.re) (hzn : 9 ≤ ‖z‖) :
    (f.map (Int.castRingHom ℂ)).eval z ≠ 0 := by
  intro hroot
  have hlead : 1 ≤ f.leadingCoeff := by
    have := (hdigit f.natDegree).1
    have := leadingCoeff_ne_zero.mpr hf
    rw [coeff_natDegree] at *
    omega
  rw [eval_map, eval₂_eq_sum_range] at hroot
  rcases hd : f.natDegree with _ | k
  · simp only [hd, Nat.zero_add, Finset.sum_range_one, pow_zero, mul_one] at hroot
    have hc : f.coeff 0 ≠ 0 := by simpa [← hd] using leadingCoeff_ne_zero.mpr hf
    exact hc (by simpa using hroot)
  · rw [hd, Finset.sum_range_succ, Finset.sum_range_succ] at hroot
    have htop : ‖z‖ ^ (k + 1) ≤
        ‖(f.coeff k : ℂ) * z ^ k + (f.coeff (k + 1) : ℂ) * z ^ (k + 1)‖ := by
      calc
        ‖z‖ ^ (k + 1) = ‖z‖ ^ k * ‖z‖ := pow_succ _ _
        _ ≤ ‖z‖ ^ k * ‖(f.coeff k : ℂ) + (f.coeff (k + 1) : ℂ) * z‖ := by
          gcongr
          apply digit_linear_norm _ _ (hdigit k).1
          · simpa [← hd] using hlead
          · exact hzr
        _ = _ := by rw [← norm_pow, ← norm_mul]; congr 1; ring
    have hlow : ‖∑ i ∈ Finset.range k, (f.coeff i : ℂ) * z ^ i‖ ≤ 2 * ‖z‖ ^ k := by
      calc
        _ ≤ ∑ i ∈ Finset.range k, ‖(f.coeff i : ℂ) * z ^ i‖ := norm_sum_le _ _
        _ ≤ ∑ i ∈ Finset.range k, (9 : ℝ) * ‖z‖ ^ i := by
          apply Finset.sum_le_sum
          intro i hi
          rw [norm_mul, norm_pow, Complex.norm_intCast,
            abs_of_nonneg (show (0 : ℝ) ≤ f.coeff i by exact_mod_cast (hdigit i).1)]
          gcongr
          exact_mod_cast (hdigit i).2
        _ ≤ _ := digit_sum_bound _ hzn _
    have heq : (f.coeff k : ℂ) * z ^ k +
        (f.coeff (k + 1) : ℂ) * z ^ (k + 1) =
        -(∑ i ∈ Finset.range k, (f.coeff i : ℂ) * z ^ i) := by
      linear_combination hroot
    rw [heq, norm_neg] at htop
    have hpos : 0 < ‖z‖ ^ k := pow_pos (by linarith) _
    rw [pow_succ] at htop
    nlinarith

private lemma digit_root_distance (f : ℤ[X])
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf : f ≠ 0)
    (z : ℂ) (hz : (f.map (Int.castRingHom ℂ)).IsRoot z) :
    1 < ‖(10 : ℂ) - z‖ := by
  by_contra! h
  have hre := Complex.re_le_norm ((10 : ℂ) - z)
  have hn := norm_sub_norm_le (10 : ℂ) z
  have hten : ‖(10 : ℂ)‖ = 10 := by norm_num
  change (10 : ℝ) - z.re ≤ ‖(10 : ℂ) - z‖ at hre
  exact digit_no_root f hdigit hf z (by linarith) (by linarith) hz

private lemma prod_norm_gt_one (s : Multiset ℂ) (hs : s ≠ 0)
    (h : ∀ z ∈ s, 1 < ‖z‖) : 1 < ‖s.prod‖ := by
  induction s using Multiset.induction_on with
  | empty => exact (hs rfl).elim
  | @cons a s ih =>
    rw [Multiset.prod_cons, norm_mul]
    have ha := h a (Multiset.mem_cons_self _ _)
    by_cases hzero : s = 0
    · simpa [hzero] using ha
    · have ht := ih hzero (fun z hz => h z (Multiset.mem_cons_of_mem hz))
      nlinarith

private lemma digit_factor_unit (f g : ℤ[X])
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf : f ≠ 0)
    (hgf : g ∣ f) (hunit : IsUnit (g.eval 10)) : IsUnit g := by
  by_cases hd : g.natDegree = 0
  · rw [eq_C_of_natDegree_eq_zero hd] at hunit ⊢
    simpa only [eval_C, isUnit_C] using hunit
  have hg : g ≠ 0 := by
    intro h
    subst g
    exact hf (by simpa using hgf)
  let G : ℂ[X] := g.map (Int.castRingHom ℂ)
  have hG : G ≠ 0 := by
    exact (Polynomial.map_ne_zero_iff (Int.castRingHom ℂ).injective_int).mpr hg
  have hroots : G.roots ≠ 0 := by
    intro h
    have hcard := IsAlgClosed.card_roots_eq_natDegree (p := G)
    rw [h, Multiset.card_zero] at hcard
    have hdeg : G.natDegree = g.natDegree := natDegree_map_eq_of_injective
      (Int.castRingHom ℂ).injective_int g
    exact hd (hdeg ▸ hcard.symm)
  have hdist : ∀ z ∈ G.roots, 1 < ‖(10 : ℂ) - z‖ := by
    intro z hz
    apply digit_root_distance f hdigit hf z
    apply eval_eq_zero_of_dvd_of_eval_eq_zero (Polynomial.map_dvd (Int.castRingHom ℂ) hgf)
    exact (mem_roots hG).mp hz
  have hprod : 1 < ‖(G.roots.map ((10 : ℂ) - ·)).prod‖ := by
    apply prod_norm_gt_one
    · simpa using hroots
    · intro z hz
      obtain ⟨w, hw, rfl⟩ := Multiset.mem_map.mp hz
      exact hdist w hw
  have hlc : (1 : ℝ) ≤ ‖G.leadingCoeff‖ := by
    have hl : g.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr hg
    have habs : (1 : ℤ) ≤ |g.leadingCoeff| := by
      have := abs_pos.mpr hl
      omega
    change (1 : ℝ) ≤ ‖(g.map (Int.castRingHom ℂ)).leadingCoeff‖
    rw [leadingCoeff_map_of_injective (Int.castRingHom ℂ).injective_int,
      Int.coe_castRingHom, Complex.norm_intCast, ← Int.cast_abs]
    exact_mod_cast habs
  have hnorm : ‖G.eval 10‖ = 1 := by
    have hval := Int.isUnit_iff_abs_eq.mp hunit
    change ‖(g.map (Int.castRingHom ℂ)).eval 10‖ = 1
    have heval : (10 : ℂ) = (Int.castRingHom ℂ) 10 := by norm_num
    rw [heval, eval_map_apply, Int.coe_castRingHom, Complex.norm_intCast,
      ← Int.cast_abs, hval]
    norm_num
  rw [(IsAlgClosed.splits G).eval_eq_prod_roots, norm_mul] at hnorm
  nlinarith

open Polynomial in
theorem problem6 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf : f ≠ 0 := by
    intro h
    apply hp.ne_zero
    simp [h]
  refine ⟨?_, ?_⟩
  · intro hu
    exact hp.not_isUnit (hu.map (evalRingHom 10))
  · intro g h hgh
    have hev : f.eval 10 = g.eval 10 * h.eval 10 := by rw [hgh, eval_mul]
    rcases hp.irreducible.isUnit_or_isUnit hev with hg | hh
    · exact Or.inl (digit_factor_unit f g hdigit hf ⟨h, hgh⟩ hg)
    · exact Or.inr (digit_factor_unit f h hdigit hf ⟨g, by rw [hgh, mul_comm]⟩ hh)

