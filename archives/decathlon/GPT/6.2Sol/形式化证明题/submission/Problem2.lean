import Mathlib.FieldTheory.Finite.Basic
import Mathlib.LinearAlgebra.Lagrange
import Mathlib.Algebra.Polynomial.Degree.SmallDegree
import Mathlib.Data.Nat.Prime.Factorial
import Mathlib.Data.Set.Card

open Polynomial Finset

private lemma p2_sum_top (p : ℕ) [Fact p.Prime] :
    ∑ x : ZMod p, x ^ (p - 1) = -1 := by
  classical
  have hp : 1 < p := (Fact.out : p.Prime).one_lt
  rw [← Finset.sum_erase_add _ _ (Finset.mem_univ (0 : ZMod p)),
    zero_pow (by omega : p - 1 ≠ 0), add_zero]
  calc
    _ = ∑ _x ∈ (Finset.univ : Finset (ZMod p)).erase 0, (1 : ZMod p) := by
      apply Finset.sum_congr rfl
      exact fun x hx => ZMod.pow_card_sub_one_eq_one (Finset.ne_of_mem_erase hx)
    _ = -1 := by
      have h : 1 ≤ p := by omega
      simp [Finset.card_erase_of_mem (Finset.mem_univ (0 : ZMod p)), ZMod.card, Nat.cast_sub h]

private lemma p2_sum_eval (p : ℕ) [Fact p.Prime] (P : (ZMod p)[X])
    (hP : P.natDegree < p) :
    ∑ x : ZMod p, P.eval x = -P.coeff (p - 1) := by
  classical
  have hp : 0 < p := (Fact.out : p.Prime).pos
  simp_rw [Polynomial.eval_eq_sum_range' hP]
  rw [Finset.sum_comm]
  simp_rw [← Finset.mul_sum]
  rw [show Finset.range p = Finset.range ((p - 1) + 1) from congrArg _ (by omega), Finset.sum_range_succ]
  have hzero : ∀ i ∈ Finset.range (p - 1), (∑ x : ZMod p, x ^ i) = 0 := by
    intro i hi
    exact FiniteField.sum_pow_lt_card_sub_one (ZMod p) i (by simpa [ZMod.card] using hi)
  rw [Finset.sum_eq_zero (fun i hi => by rw [hzero i hi, mul_zero]), zero_add,
    p2_sum_top, mul_neg_one]

private lemma p2_exponents {N d : ℕ} (hN : N % 2 = 0) (hd : 2 ≤ d)
    (hdN : d ≤ N) :
    ∃ i j : ℕ, 0 < j ∧ i + d * j = N ∧ 2 * (i + j) ≤ N := by
  let i := N % d
  let j := N / d
  have hj : 0 < j := Nat.div_pos hdN (by omega)
  have hij : i + d * j = N := Nat.mod_add_div N d
  have hi : i < d := Nat.mod_lt _ (by omega)
  refine ⟨i, j, hj, hij, ?_⟩
  by_cases h₂ : d = 2
  · subst d
    have : i = 0 := hN
    omega
  by_cases h₁ : j = 1
  · rw [h₁, mul_one] at hij
    omega
  have hh := Nat.mul_le_mul_right (d - 2) (show 2 ≤ j by omega)
  simp only [Nat.mul_sub, Nat.mul_comm j d, Nat.mul_comm j 2] at hh
  omega

theorem problem2 (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := by
  classical
  let P : (ZMod p)[X] := Lagrange.interpolate Finset.univ id f
  have hPe : ∀ x, P.eval x = f x := fun x =>
    Lagrange.eval_interpolate_at_node f (fun _ _ _ _ h => h) (Finset.mem_univ x)
  have hdeg : 2 ≤ P.natDegree := by
    by_contra! hn
    obtain ⟨a, b, h⟩ := exists_eq_X_add_C_of_natDegree_le_one (show P.natDegree ≤ 1 by omega)
    apply hf
    exact ⟨a, b, fun x => by simpa [h] using (hPe x).symm⟩
  have hPn : P ≠ 0 := by
    intro h
    simp [h] at hdeg
  have hPp : P.natDegree < p := by
    apply (natDegree_lt_iff_degree_lt hPn).mpr
    have h := Lagrange.degree_interpolate_lt (s := (Finset.univ : Finset (ZMod p)))
      f (v := id) (fun _ _ _ _ h => h)
    simpa [P, ZMod.card] using h
  have hodd : p % 2 = 1 := (Fact.out : p.Prime).eq_two_or_odd.resolve_left (by omega)
  obtain ⟨i, j, hj, hij, hk⟩ := p2_exponents (N := p - 1) (by omega) hdeg (by omega)
  let k := i + j
  have hkp : k < p - 1 := by dsimp [k]; omega
  have hki : i ≤ k := Nat.le_add_right _ _
  have hkj : k - i = j := by simp [k]
  let R : (ZMod p)[X] := X ^ i * P ^ j
  have hRn : R ≠ 0 := mul_ne_zero (pow_ne_zero _ X_ne_zero) (pow_ne_zero _ hPn)
  have hRd : R.natDegree = p - 1 := by
    dsimp [R]
    rw [natDegree_X_pow_mul i (pow_ne_zero _ hPn), natDegree_pow, Nat.mul_comm j]
    omega
  have hmixed : (∑ x : (ZMod p), x ^ i * f x ^ j) ≠ 0 := by
    have h := p2_sum_eval p R (by omega)
    rw [← hRd, coeff_natDegree] at h
    simp only [R, eval_mul, eval_pow, eval_X, hPe] at h
    rw [h]
    exact neg_ne_zero.mpr (leadingCoeff_ne_zero.mpr hRn)
  let c : ℕ → (ZMod p) := fun l => (k.choose l : (ZMod p)) * ∑ x : (ZMod p), x ^ l * f x ^ (k - l)
  let Q : (ZMod p)[X] := ∑ l ∈ Finset.range (k + 1), monomial l (c l)
  have hcoeff : ∀ l ≤ k, Q.coeff l = c l := by
    intro l hl
    simp [Q, coeff_monomial, Finset.mem_range, show l < k + 1 by omega]
  have hci : c i ≠ 0 := by
    apply mul_ne_zero
    · rw [ne_eq, ZMod.natCast_eq_zero_iff]
      intro H
      apply (not_le_of_gt (show k < p by omega))
      apply (Fact.out : p.Prime).dvd_factorial.mp
      rw [← Nat.choose_mul_factorial_mul_factorial hki]
      exact dvd_mul_of_dvd_left (dvd_mul_of_dvd_left H _) _
    · simpa only [hkj] using hmixed
  have hQ : Q ≠ 0 := by
    intro h
    exact hci (by rw [← hcoeff i hki, h, coeff_zero])
  have hck : c k = 0 := by
    simpa only [c, Nat.choose_self, Nat.cast_one, Nat.sub_self, pow_zero, mul_one, one_mul] using
      FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by simpa [ZMod.card] using hkp)
  have hQdeg : Q.natDegree < k := by
    have hle : Q.natDegree ≤ k := by
      apply natDegree_sum_le_of_forall_le
      intro l hl
      exact (natDegree_monomial_le _).trans (by simpa using hl)
    refine lt_of_le_of_ne hle fun h => ?_
    exact (leadingCoeff_ne_zero.mpr hQ) (by rw [← coeff_natDegree, h, hcoeff k le_rfl, hck])
  have hQeval (m : (ZMod p)) : Q.eval m = ∑ x : (ZMod p), (f x + m * x) ^ k := by
    simp only [Q, eval_finsetSum, eval_monomial, c]
    trans ∑ l ∈ Finset.range (k + 1), ∑ x : (ZMod p),
        ((x * m) ^ l * f x ^ (k - l) * (k.choose l : (ZMod p)))
    · apply Finset.sum_congr rfl
      intro l hl
      rw [Finset.mul_sum, Finset.sum_mul]
      apply Finset.sum_congr rfl
      intro x hx
      rw [mul_pow]
      ac_rfl
    · rw [Finset.sum_comm]
      apply Finset.sum_congr rfl
      intro x hx
      rw [show f x + m * x = x * m + f x by ring, add_pow]
  let D : Set (ZMod p) := {m | ∃ x y : (ZMod p), x ≠ y ∧ f x - f y = m * (x - y)}
  let M : Finset (ZMod p) := Finset.univ.filter (fun m => m ∉ D)
  have hM : M.card ≤ Q.natDegree := by
    let e := (Equiv.neg (ZMod p)).toEmbedding
    rw [← Finset.card_map e]
    apply card_le_degree_of_subset_roots
    intro z hz
    obtain ⟨m, hm, rfl⟩ := Finset.mem_map.mp (Finset.mem_def.mpr hz)
    have hm' : m ∉ D := (Finset.mem_filter.mp hm).2
    have hi : Function.Injective (fun x => f x - m * x) := by
      intro x y he
      by_contra hne
      apply hm'
      exact ⟨x, y, hne, by linear_combination he⟩
    have he := (Equiv.ofBijective _ hi.bijective_of_finite).sum_comp
      (fun x : (ZMod p) => x ^ k)
    apply (mem_roots hQ).mpr
    rw [IsRoot, hQeval]
    change (∑ x : ZMod p, (f x + -m * x) ^ k) = 0
    simp only [neg_mul, ← sub_eq_add_neg]
    exact he.trans (FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by simpa [ZMod.card] using hkp))
  have hcard : D.ncard + M.card = p := by
    have h := Finset.card_filter_add_card_filter_not (s := (Finset.univ : Finset (ZMod p)))
      (fun m => m ∈ D)
    have he : Finset.univ.filter (fun m => m ∈ D) = D.toFinset := by ext; simp
    rw [he, ← Set.ncard_eq_toFinset_card' D] at h
    simpa [M, ZMod.card] using h
  change p + 3 ≤ 2 * D.ncard
  dsimp [k] at hQdeg
  omega

#print axioms problem2
