import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Polynomial.Splits
import Mathlib.FieldTheory.IsAlgClosed.Basic
import Mathlib.Analysis.Complex.Norm
import Mathlib.Algebra.Ring.GeomSum

open Polynomial

namespace Problem3

lemma prod_gt_one (s : Multiset ℂ) (h : ∀ z ∈ s, 1 < ‖(10 : ℂ) - z‖) :
    1 ≤ ‖(s.map (fun a => (10 : ℂ) - a)).prod‖ ∧
      (s ≠ 0 → 1 < ‖(s.map (fun a => (10 : ℂ) - a)).prod‖) := by
  induction s using Multiset.induction_on with
  | empty => simp
  | cons a s ih =>
    have ha := h a (Multiset.mem_cons_self a s)
    have ih' := ih (fun z hz => h z (Multiset.mem_cons_of_mem hz))
    have : 1 < ‖(10 : ℂ) - a‖ * ‖(s.map (fun a => (10 : ℂ) - a)).prod‖ :=
      one_lt_mul_of_lt_of_le ha ih'.1
    rw [Multiset.map_cons, Multiset.prod_cons, norm_mul]
    exact ⟨this.le, fun _ => this⟩

lemma root_far (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf0 : f ≠ 0)
    (z : ℂ) (hz : (f.map (Int.castRingHom ℂ)).eval z = 0) : 1 < ‖(10 : ℂ) - z‖ := by
  by_contra hcon
  have hle : ‖(10 : ℂ) - z‖ ≤ 1 := not_lt.1 hcon
  have hre : 9 ≤ z.re := by
    have h1 : ((10 : ℂ) - z).re ≤ ‖(10 : ℂ) - z‖ := Complex.re_le_norm _
    have h2 : ((10 : ℂ) - z).re = 10 - z.re := by simp
    rw [h2] at h1
    linarith
  have hr : 9 ≤ ‖z‖ := hre.trans (Complex.re_le_norm z)
  rw [eval_map, eval₂_eq_sum_range] at hz
  rcases Nat.eq_zero_or_pos f.natDegree with h0 | hpos
  · rw [h0] at hz
    simp only [zero_add, Finset.range_one, Finset.sum_singleton, pow_zero, mul_one,
      eq_intCast, Int.cast_eq_zero] at hz
    apply hf0
    rw [eq_C_of_natDegree_eq_zero h0, hz, C_0]
  · obtain ⟨m, hm⟩ : ∃ m, f.natDegree = m + 1 := ⟨f.natDegree - 1, by omega⟩
    rw [hm, Finset.sum_range_succ, Finset.sum_range_succ] at hz
    simp only [eq_intCast] at hz
    set S : ℂ := ∑ k ∈ Finset.range m, (f.coeff k : ℂ) * z ^ k with hS
    have hlead : 1 ≤ f.coeff (m + 1) := by
      have h1 : f.coeff (m + 1) ≠ 0 := by
        rw [← hm]
        exact leadingCoeff_ne_zero.2 hf0
      have := (hdigit (m + 1)).1
      omega
    have hT : (9 : ℝ) * ‖z‖ ^ m ≤
        ‖(f.coeff m : ℂ) * z ^ m + (f.coeff (m + 1) : ℂ) * z ^ (m + 1)‖ := by
      have e : (f.coeff m : ℂ) * z ^ m + (f.coeff (m + 1) : ℂ) * z ^ (m + 1)
          = z ^ m * ((f.coeff m : ℂ) + (f.coeff (m + 1) : ℂ) * z) := by
        ring
      rw [e, norm_mul, norm_pow, mul_comm]
      apply mul_le_mul_of_nonneg_left _ (pow_nonneg (norm_nonneg _) _)
      have h2 : ((f.coeff m : ℂ) + (f.coeff (m + 1) : ℂ) * z).re
          ≤ ‖(f.coeff m : ℂ) + (f.coeff (m + 1) : ℂ) * z‖ := Complex.re_le_norm _
      have h3 : ((f.coeff m : ℂ) + (f.coeff (m + 1) : ℂ) * z).re
          = (f.coeff m : ℝ) + (f.coeff (m + 1) : ℝ) * z.re := by
        simp
      have h4 : (0 : ℝ) ≤ (f.coeff m : ℝ) := by exact_mod_cast (hdigit m).1
      have h5 : (1 : ℝ) ≤ (f.coeff (m + 1) : ℝ) := by exact_mod_cast hlead
      nlinarith
    have hSle : ‖S‖ ≤ 9 * ∑ k ∈ Finset.range m, ‖z‖ ^ k := by
      rw [Finset.mul_sum]
      refine (norm_sum_le _ _).trans (Finset.sum_le_sum (fun k _ => ?_))
      rw [norm_mul, norm_pow, Complex.norm_intCast]
      apply mul_le_mul_of_nonneg_right _ (pow_nonneg (norm_nonneg _) _)
      have h6 : (0 : ℝ) ≤ (f.coeff k : ℝ) := by exact_mod_cast (hdigit k).1
      have h7 : (f.coeff k : ℝ) ≤ 9 := by exact_mod_cast (hdigit k).2
      rw [abs_of_nonneg h6]
      exact h7
    have hgeom := geom_sum_mul ‖z‖ m
    have hG0 : 0 ≤ ∑ k ∈ Finset.range m, ‖z‖ ^ k :=
      Finset.sum_nonneg (fun k _ => pow_nonneg (norm_nonneg _) _)
    have hpow : 0 < ‖z‖ ^ m := pow_pos (by linarith) _
    have hST : ‖(f.coeff m : ℂ) * z ^ m + (f.coeff (m + 1) : ℂ) * z ^ (m + 1)‖ = ‖S‖ := by
      have : (f.coeff m : ℂ) * z ^ m + (f.coeff (m + 1) : ℂ) * z ^ (m + 1) = -S := by
        linear_combination hz
      rw [this, norm_neg]
    have hprod := mul_nonneg hG0 (sub_nonneg.2 hr)
    nlinarith

lemma eval_big (f g h : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf0 : f ≠ 0)
    (hfg : f = g * h) (hdeg : 1 ≤ g.natDegree) : 1 < |g.eval 10| := by
  have hg0 : g ≠ 0 := by
    rintro rfl
    rw [zero_mul] at hfg
    exact hf0 hfg
  have hinj : Function.Injective (Int.castRingHom ℂ) := Int.cast_injective
  set G := g.map (Int.castRingHom ℂ) with hG
  have hG0 : G ≠ 0 := (Polynomial.map_ne_zero_iff hinj).2 hg0
  have heval : G.eval 10 = ((g.eval 10 : ℤ) : ℂ) := by
    have := eval_intCast_map (Int.castRingHom ℂ) g 10
    simpa using this
  have hsplit := IsAlgClosed.splits G
  have h1 := hsplit.eval_eq_prod_roots 10
  have hroots : ∀ z ∈ G.roots, 1 < ‖(10 : ℂ) - z‖ := by
    intro z hz
    rw [mem_roots hG0] at hz
    apply root_far f hdigit hf0 z
    rw [hfg, Polynomial.map_mul, eval_mul, hz.eq_zero, zero_mul]
  have hcard : G.roots ≠ 0 := by
    intro h0
    have := IsAlgClosed.card_roots_map_eq_natDegree_of_injective g hinj
    rw [← hG, h0] at this
    simp at this
    omega
  have hprod := (prod_gt_one G.roots hroots).2 hcard
  have hlc : 1 ≤ ‖G.leadingCoeff‖ := by
    rw [hG, leadingCoeff_map_of_injective hinj]
    simp only [eq_intCast, Complex.norm_intCast]
    exact_mod_cast Int.one_le_abs (leadingCoeff_ne_zero.2 hg0)
  have h2 : 1 < ‖G.eval 10‖ := by
    rw [h1, norm_mul]
    calc (1 : ℝ) = 1 * 1 := by norm_num
      _ < _ := mul_lt_mul' hlc hprod (by norm_num) (by linarith)
  rw [heval, Complex.norm_intCast] at h2
  exact_mod_cast h2

lemma unit_of_eval_unit (f a b : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hf0 : f ≠ 0) (hfab : f = a * b) (hu : IsUnit (a.eval 10)) : IsUnit a := by
  rcases Nat.eq_zero_or_pos a.natDegree with h0 | hpos
  · rw [eq_C_of_natDegree_eq_zero h0] at hu ⊢
    rw [eval_C] at hu
    exact Polynomial.isUnit_C.2 hu
  · exfalso
    have h1 := eval_big f a b hdigit hf0 hfab hpos
    rw [Int.isUnit_iff] at hu
    rcases hu with h | h <;> rw [h] at h1 <;> simp at h1

end Problem3

open Polynomial in
theorem problem3 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf0 : f ≠ 0 := by
    rintro rfl
    simp at hp
  refine ⟨?_, ?_⟩
  · intro hu
    exact hp.not_unit (hu.map (evalRingHom (10 : ℤ)))
  · intro a b hab
    have h10 : f.eval 10 = a.eval 10 * b.eval 10 := by rw [hab, eval_mul]
    rcases hp.irreducible.isUnit_or_isUnit h10 with h | h
    · left
      exact Problem3.unit_of_eval_unit f a b hdigit hf0 hab h
    · right
      exact Problem3.unit_of_eval_unit f b a hdigit hf0 (by rw [hab, mul_comm]) h

#print axioms problem3
