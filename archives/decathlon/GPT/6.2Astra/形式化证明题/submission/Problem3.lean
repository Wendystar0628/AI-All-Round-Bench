import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Group.Int.Units
import Mathlib.Tactic

open Polynomial Finset
private theorem farRoot (f : ℤ[X]) (hf : f ≠ 0)
    (hd : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (z : ℂ) (hz : f.eval₂ (Int.castRingHom ℂ) z = 0) : 1 < ‖10-z‖ := by
  by_contra! h
  have hre := Complex.re_le_norm (10-z)
  norm_num [Complex.sub_re] at hre
  have h9 : 9 ≤ z.re := by linarith
  have hR : 9 ≤ ‖z‖ := h9.trans (Complex.re_le_norm z)
  let c (i : ℕ) : ℂ := f.coeff i
  have hnorm (i) : ‖c i‖ ≤ 9 := by
    dsimp [c]
    rw [Complex.norm_intCast, abs_of_nonneg (by exact_mod_cast (hd i).1)]
    exact_mod_cast (hd i).2
  let S (k : ℕ) := ∑ i ∈ range k, c i*z^i
  have hb (k : ℕ) : ‖S k‖ ≤ 2*‖z‖^k := by
    induction k with
    | zero => simp [S]
    | succ k ih =>
      change ‖∑ i ∈ range (k+1), c i*z^i‖ ≤ _
      rw [sum_range_succ, pow_succ]
      calc
        _ ≤ ‖S k‖ + ‖c k * z^k‖ := norm_add_le .. 
        _ ≤ 2*‖z‖^k + 9*‖z‖^k := by
          rw [norm_mul, norm_pow]
          exact add_le_add ih (mul_le_mul_of_nonneg_right (hnorm _) (by positivity))
        _ ≤ _ := by have H := mul_le_mul_of_nonneg_right (show 2+9 ≤ 2*‖z‖ by linarith) (show 0 ≤ ‖z‖^k by positivity)
                    linarith only [H]
  have hlead : 1 ≤ f.coeff f.natDegree := by
    have H : f.coeff f.natDegree ≠ 0 := leadingCoeff_ne_zero.mpr hf
    have := (hd f.natDegree).1
    omega
  rw [eval₂_eq_sum_range] at hz
  change S (f.natDegree+1) = 0 at hz
  cases hn : f.natDegree with
  | zero =>
    rw [hn] at hz hlead
    simp [S,c] at hz
    omega
  | succ k =>
    rw [hn] at hz hlead
    change (∑ i ∈ range ((k+1)+1), c i*z^i) = 0 at hz
    rw [sum_range_succ, sum_range_succ] at hz
    have hh : (c k + c (k+1)*z)*z^k = -(S k) := by
      dsimp [S]
      rw [pow_succ] at hz
      linear_combination hz
    have hN := congrArg norm hh
    rw [norm_mul, norm_pow, norm_neg] at hN
    have hB : ‖c k + c (k+1)*z‖ ≤ 2 := by
      apply le_of_mul_le_mul_right (a := ‖z‖^k) _ (pow_pos (by linarith) _)
      rw [hN]
      exact hb k
    have H := Complex.re_le_norm (c k + c (k+1)*z)
    simp [c, Complex.add_re, Complex.mul_re] at H
    have H1 : (1:ℝ) ≤ (f.coeff (k+1) : ℝ) := by exact_mod_cast hlead
    have H0 : (0:ℝ) ≤ (f.coeff k : ℝ) := by exact_mod_cast (hd k).1
    dsimp [c] at hB
    nlinarith [mul_nonneg (sub_nonneg.mpr H1) (show 0 ≤ z.re by linarith)]

private theorem prodFar (s : Multiset ℂ) (hs : ∀ z ∈ s, 1 < ‖10-z‖) :
    1 ≤ ‖(s.map (10-·)).prod‖ ∧ (s ≠ 0 → 1 < ‖(s.map (10-·)).prod‖) := by
  induction s using Multiset.induction_on with
  | empty => simp
  | cons z s ih =>
    have H := (ih (fun x hx => hs x (Multiset.mem_cons_of_mem hx))).1
    have H' := hs z (Multiset.mem_cons_self ..)
    simp only [Multiset.map_cons, Multiset.prod_cons, norm_mul]
    have hprod := lt_of_lt_of_le H' (le_mul_of_one_le_right (norm_nonneg _) H)
    exact ⟨hprod.le,fun _ => hprod⟩

open Polynomial in
theorem problem3 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf : f ≠ 0 := by intro h; apply hp.ne_zero; simp [h]
  have hfactor (g : ℤ[X]) (hg : g ∣ f) (hunit : IsUnit (g.eval 10)) : IsUnit g := by
    by_cases hd : g.natDegree = 0
    · have he := eq_C_of_natDegree_eq_zero hd
      rw [he, eval_C] at hunit
      rw [he]
      exact hunit.map C
    exfalso
    let φ := Int.castRingHom ℂ
    let G := g.map φ
    have hinj : Function.Injective φ := Int.cast_injective
    have hn : G.natDegree = g.natDegree := natDegree_map_eq_of_injective hinj _
    have hG : G ≠ 0 := by intro h; rw [h, natDegree_zero] at hn; exact hd hn.symm
    have H (z : ℂ) (hz : z ∈ G.roots) : 1 < ‖10-z‖ := by
      apply farRoot f hf hdigit
      obtain ⟨j,hj⟩ := hg
      have he := (mem_roots hG).mp hz
      change (g.map φ).eval z = 0 at he
      rw [eval_map] at he
      rw [hj, eval₂_mul, he, zero_mul]
    have hne : G.roots ≠ 0 := by
      intro h
      have hh := splits_iff_card_roots.mp (IsAlgClosed.splits G)
      rw [h, Multiset.card_zero, hn] at hh
      exact hd hh.symm
    have H' := (prodFar G.roots H).2 hne
    have hlc : 1 ≤ ‖G.leadingCoeff‖ := by
      rw [show G.leadingCoeff = φ g.leadingCoeff from leadingCoeff_map_of_injective hinj _]
      change 1 ≤ ‖(g.leadingCoeff : ℂ)‖
      rw [Complex.norm_intCast, ← Int.cast_abs]
      have h : g.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr (by intro h; simp [h] at hd)
      exact_mod_cast (show 1 ≤ |g.leadingCoeff| by rcases le_total 0 g.leadingCoeff with H | H <;> simp [abs_of_nonneg, abs_of_nonpos, *] <;> omega)
    have hval : 1 < ‖G.eval 10‖ := by
      rw [(IsAlgClosed.splits G).eval_eq_prod_roots, norm_mul]
      exact H'.trans_le (le_mul_of_one_le_left (norm_nonneg _) hlc)
    change 1 < ‖(g.map φ).eval (φ 10)‖ at hval
    rw [eval_map_apply] at hval
    rcases Int.isUnit_eq_one_or hunit with h | h <;> simp [h] at hval
  refine ⟨fun h => hp.not_isUnit (h.map (evalRingHom 10)), ?_⟩
  intro a b hab
  have he : f.eval 10 = a.eval 10 * b.eval 10 := by rw [hab,eval_mul]
  rcases hp.irreducible.isUnit_or_isUnit he with h | h
  · exact Or.inl (hfactor a ⟨b,hab⟩ h)
  · exact Or.inr (hfactor b ⟨a,by rw [hab,mul_comm]⟩ h)

#print axioms problem3