import Mathlib.LinearAlgebra.Lagrange
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.Algebra.Polynomial.Degree.SmallDegree
import Mathlib.Data.Nat.Prime.Factorial
import Mathlib.Data.Set.Card
import Mathlib.Tactic

open Polynomial Finset
open scoped BigOperators
private theorem splitDegree {p d : ℕ} (hp : Odd p) (hd : 2 ≤ d) (hlt : d < p) :
    ∃ i j : ℕ, 0 < j ∧ j*d+i = p-1 ∧ 2*(i+j) ≤ p-1 := by
  let i := (p-1)%d
  let j := (p-1)/d
  have he : j*d+i = p-1 := by simpa [j,i, Nat.mul_comm, Nat.add_comm] using Nat.mod_add_div (p-1) d
  have hi : i < d := Nat.mod_lt _ (by omega)
  have hj : 0 < j := Nat.div_pos (by omega) (by omega)
  refine ⟨i,j,hj,he,?_⟩
  obtain ⟨s, hs⟩ := hp
  by_cases h : j = 1
  · rw [h, one_mul] at he
    omega
  by_cases h' : d = 2
  · rw [h'] at he hi
    omega
  have hh : 0 ≤ (j:ℤ)-2 := by omega
  have hh' : 0 ≤ (d:ℤ)-2 := by omega
  zify at he hi ⊢
  have H : (3:ℤ) ≤ d := by omega
  have H' : (i:ℤ)+1 ≤ d := by omega
  nlinarith [mul_nonneg hh hh']

private theorem moment_ne {p : ℕ} [Fact p.Prime] (hp : 2 < p)
    (G : (ZMod p)[X]) (hg : G.natDegree = p-1) : ∑ x : ZMod p, G.eval x ≠ 0 := by
  classical
  have htop : ∑ x : ZMod p, x^(p-1) = -1 := by
    have he (x : ZMod p) : x^(p-1) = 1 - (if x = 0 then 1 else 0) := by
      split_ifs with h
      · simp [h, zero_pow (show p-1 ≠ 0 by omega)]
      · simp [ZMod.pow_card_sub_one_eq_one h]
    simp [he, Finset.sum_sub_distrib, ZMod.card]
  simp_rw [eval_eq_sum_range, hg]
  rw [Finset.sum_comm, Finset.sum_range_succ]
  simp_rw [← Finset.mul_sum]
  have hz : ∀ i ∈ range (p-1), ∑ x : ZMod p, x^i = 0 := fun i hi =>
    FiniteField.sum_pow_lt_card_sub_one _ _ (by simpa [ZMod.card] using mem_range.mp hi)
  rw [Finset.sum_eq_zero (fun i hi => by rw [hz i hi, mul_zero]), zero_add, htop, ← hg]
  exact mul_ne_zero (leadingCoeff_ne_zero.mpr (show G ≠ 0 by intro h; simp [h] at hg; omega)) (by simp)

theorem problem2 (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := by
  classical
  let F := Lagrange.interpolate univ id f
  have he (x : ZMod p) : F.eval x = f x :=
    Lagrange.eval_interpolate_at_node f Function.injective_id.injOn (mem_univ x)
  have hd : 2 ≤ F.natDegree := by
    by_contra! h
    obtain ⟨a,b,h⟩ := exists_eq_X_add_C_of_natDegree_le_one (by omega : F.natDegree ≤ 1)
    exact hf ⟨a,b,fun x => by rw [← he, h]; simp⟩
  have hF : F ≠ 0 := by intro h; simp [h] at hd
  have hlt : F.natDegree < p := (natDegree_lt_iff_degree_lt hF).mpr (by
    simpa only [card_univ, ZMod.card, F] using Lagrange.degree_interpolate_lt f (s := univ) Function.injective_id.injOn)
  have prime := Fact.out (p := p.Prime)
  obtain ⟨i,j,hj,hij,hbound⟩ := splitDegree (prime.odd_of_ne_two (by omega)) hd hlt
  let k := i+j
  have hk : k < p-1 := by dsimp [k]; omega
  have hm := moment_ne hp (X^i * F^j) (by rw [natDegree_X_pow_mul i (pow_ne_zero _ hF), natDegree_pow,hij])
  simp only [eval_mul, eval_pow, eval_X, he] at hm
  let t (l : ℕ) : ZMod p := ((k.choose l : ℕ) : ZMod p) * (-1)^l *
    ∑ x : ZMod p, x^l * (f x)^(k-l)
  have hti : t i ≠ 0 := by
    have hch : (k.choose i : ZMod p) ≠ 0 := by
      rw [Ne, ZMod.natCast_eq_zero_iff]
      intro H
      have dvd : k.choose i ∣ k.factorial := by
        rw [← Nat.choose_mul_factorial_mul_factorial (show i ≤ k by dsimp [k]; omega)]
        exact dvd_mul_of_dvd_left (dvd_mul_right ..) _
      have := prime.dvd_factorial.mp (H.trans dvd)
      omega
    dsimp [t]; rw [show k-i=j by dsimp [k]; omega]
    exact mul_ne_zero (mul_ne_zero hch (pow_ne_zero _ (by simp))) hm
  let P : (ZMod p)[X] := ∑ l ∈ range k, monomial l (t l)
  have hP : P ≠ 0 := by
    intro h
    apply hti
    have := congrArg (fun Q : (ZMod p)[X] => Q.coeff i) h
    simpa [P, finsetSum_coeff, coeff_monomial, show i < k by dsimp [k]; omega] using this
  have hdeg : P.natDegree ≤ k-1 := by
    apply natDegree_sum_le_of_forall_le
    intro l hl
    exact (natDegree_monomial_le _).trans (by have := mem_range.mp hl; omega)
  have htk : t k = 0 := by
    simp [t, FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by simpa [ZMod.card] using hk)]
  have hval (m : ZMod p) : P.eval m = ∑ x : ZMod p, (f x - m*x)^k := by
    simp only [P, eval_finsetSum, eval_monomial]
    have H (l : ℕ) : t l * m^l = ∑ x : ZMod p, (-m*x)^l*(f x)^(k-l)*k.choose l := by
      simp only [t, Finset.mul_sum, Finset.sum_mul]
      apply sum_congr rfl
      intro x _
      rw [show -m*x = (-1)*m*x by ring]
      simp only [mul_pow]; ring
    calc
      _ = ∑ l ∈ range (k+1), t l * m^l := by rw [sum_range_succ, htk, zero_mul, add_zero]
      _ = _ := by
        simp_rw [H]
        rw [Finset.sum_comm]
        apply sum_congr rfl
        intro x _
        rw [← add_pow]
        congr 1
        ring
  let D := {m : ZMod p | ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x-y)}
  have hcard : Dᶜ.ncard ≤ k-1 := by
    rw [Set.ncard_eq_toFinset_card']
    apply le_trans (card_le_degree_of_subset_roots (p := P) ?_) hdeg
    intro m hm'
    have hnot : m ∉ D := Set.mem_toFinset.mp hm'
    have hinj : Function.Injective (fun x => f x - m*x) := by
      intro x y h
      by_contra hne
      exact hnot ⟨x,y,hne,by dsimp at h; linear_combination h⟩
    apply (mem_roots hP).mpr
    rw [IsRoot, hval]
    let e := Equiv.ofBijective _ (Finite.injective_iff_bijective.mp hinj)
    exact (e.sum_comp (fun x => x^k)).trans (FiniteField.sum_pow_lt_card_sub_one _ _ (by simpa [ZMod.card] using hk))
  have ht := Set.ncard_add_ncard_compl D
  rw [Nat.card_eq_fintype_card, ZMod.card] at ht
  change p+3 ≤ 2*D.ncard
  dsimp [k] at hcard
  omega

#print axioms problem2