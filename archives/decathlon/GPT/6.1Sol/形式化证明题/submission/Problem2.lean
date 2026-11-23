import Mathlib.LinearAlgebra.Lagrange
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.Data.Set.Card
import Mathlib.Data.Nat.Choose.Dvd
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Ring
import Mathlib.Tactic.LinearCombination

open Polynomial Finset

set_option maxRecDepth 4096

private lemma moment_indices (N d : ℕ) (hN : Even N) (h2 : 2 ≤ d) (hd : d ≤ N) :
    ∃ a b : ℕ, 0 < b ∧ a + d * b = N ∧ 2 * (a + b) ≤ N := by
  let a := N % d
  let b := N / d
  have hdp : 0 < d := by omega
  have ha : a < d := Nat.mod_lt _ hdp
  have hb : 1 ≤ b := (Nat.le_div_iff_mul_le hdp).mpr (by simpa using hd)
  have he : a + d * b = N := Nat.mod_add_div _ _
  refine ⟨a, b, hb, he, ?_⟩
  rcases hN with ⟨k, hk⟩
  by_cases hdeq : d = 2
  · subst d
    omega
  by_cases hbeq : b = 1
  · simp only [hbeq, mul_one] at he ⊢
    omega
  have hb2 : 2 ≤ b := by omega
  have hd3 : 3 ≤ d := by omega
  nlinarith

private lemma sum_top_power (p : ℕ) [Fact p.Prime] :
    (∑ x : ZMod p, x ^ (p - 1)) = -1 := by
  have he : ∀ x : ZMod p, x ^ (p - 1) = 1 - if x = 0 then 1 else 0 := by
    intro x
    rw [ZMod.pow_card_sub_one]
    split_ifs <;> simp_all
  simp_rw [he, Finset.sum_sub_distrib]
  simp [ZMod.card]

private lemma sum_eval_top (p : ℕ) [Fact p.Prime] (P : (ZMod p)[X])
    (hP : P.natDegree ≤ p - 1) :
    (∑ x : ZMod p, P.eval x) = -P.coeff (p - 1) := by
  classical
  have hp : 0 < p := (Fact.out : p.Prime).pos
  have hex : ∀ x, P.eval x = ∑ i ∈ range p, P.coeff i * x ^ i := by
    intro x
    exact eval_eq_sum_range' (by omega) _
  simp_rw [hex]
  rw [Finset.sum_comm]
  simp_rw [← Finset.mul_sum]
  rw [Finset.sum_eq_single (p - 1)]
  · rw [sum_top_power]
    ring
  · intro i hi hine
    have hi' : i < p - 1 := by have := mem_range.mp hi; omega
    have hz := FiniteField.sum_pow_lt_card_sub_one (ZMod p) i (by simpa using hi')
    rw [hz, mul_zero]
  · intro h
    exact (h (mem_range.mpr (by omega))).elim

private lemma moment_exists (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    ∃ a b : ℕ, 0 < a + b ∧ 2 * (a + b) ≤ p - 1 ∧
      (∑ x : ZMod p, x ^ a * f x ^ b) ≠ 0 := by
  classical
  let F := Lagrange.interpolate (univ : Finset (ZMod p)) id f
  have hFval : ∀ x, F.eval x = f x := by
    intro x
    exact Lagrange.eval_interpolate_at_node f (by intro a ha b hb h; exact h) (mem_univ x)
  have hFdeg : F.natDegree ≤ p - 1 := by
    apply natDegree_le_of_degree_le
    simpa [ZMod.card, F] using
      (Lagrange.degree_interpolate_le (s := (univ : Finset (ZMod p)))
        (v := id) (r := f) (by intro a ha b hb h; exact h))
  have hFtwo : 2 ≤ F.natDegree := by
    by_contra! h
    apply hf
    refine ⟨F.coeff 1, F.coeff 0, fun x => ?_⟩
    rw [← hFval x, eq_X_add_C_of_natDegree_le_one (p := F) (by omega)]
    simp
  have hFne : F ≠ 0 := by intro h; simp [h] at hFtwo
  have hEven : Even (p - 1) :=
    (Fact.out : p.Prime).even_sub_one (by omega)
  obtain ⟨a, b, hb, he, hbound⟩ := moment_indices (p - 1) F.natDegree hEven hFtwo hFdeg
  let H : (ZMod p)[X] := X ^ a * F ^ b
  have hHne : H ≠ 0 := mul_ne_zero (pow_ne_zero _ X_ne_zero) (pow_ne_zero _ hFne)
  have hHd : H.natDegree = p - 1 := by
    change (X ^ a * F ^ b).natDegree = _
    rw [natDegree_mul (pow_ne_zero _ X_ne_zero) (pow_ne_zero _ hFne),
      natDegree_X_pow, natDegree_pow]
    nlinarith [he]
  have hsum : (∑ x : ZMod p, H.eval x) ≠ 0 := by
    rw [sum_eval_top p H hHd.le, ← hHd, coeff_natDegree]
    exact neg_ne_zero.mpr (leadingCoeff_ne_zero.mpr hHne)
  refine ⟨a, b, by omega, hbound, ?_⟩
  simpa [H, eval_mul, eval_pow, hFval] using hsum

private noncomputable def momentPolynomial (p : ℕ) [Fact p.Prime]
    (f : ZMod p → ZMod p) (k : ℕ) : (ZMod p)[X] :=
  ∑ x : ZMod p, (C (f x) - C x * X) ^ k

private lemma moment_coeff (p : ℕ) [Fact p.Prime] (f : ZMod p → ZMod p)
    (k a : ℕ) :
    (momentPolynomial p f k).coeff a =
      (k.choose a : ZMod p) * (-1) ^ a * ∑ x : ZMod p, x ^ a * f x ^ (k - a) := by
  classical
  have he : ∀ x : ZMod p,
      (C (f x) - C x * X : (ZMod p)[X]) = (X + C (f x)).comp (C (-x) * X) := by
    intro x
    simp
    ring
  have hcoef : ∀ x : ZMod p, ((C (f x) - C x * X) ^ k).coeff a =
      f x ^ (k - a) * (k.choose a : ZMod p) * (-x) ^ a := by
    intro x
    rw [he x, ← pow_comp (X + C (f x)) (C (-x) * X) k,
      comp_C_mul_X_coeff, coeff_X_add_C_pow]
  simp only [momentPolynomial, finsetSum_coeff]
  simp_rw [hcoef]
  rw [Finset.mul_sum]
  apply Finset.sum_congr rfl
  intro x hx
  rw [neg_pow x a]
  ring

private lemma moment_degree (p : ℕ) [Fact p.Prime] (f : ZMod p → ZMod p)
    (k : ℕ) (hk : k < p - 1) :
    (momentPolynomial p f k).degree < k := by
  classical
  have hdeg : (momentPolynomial p f k).natDegree ≤ k := by
    apply natDegree_sum_le_of_forall_le
    intro x hx
    have hlin : (C (f x) - C x * X : (ZMod p)[X]).natDegree ≤ 1 := by
      apply (natDegree_sub_le _ _).trans
      apply max_le
      · simp
      · exact natDegree_mul_le.trans (by simp)
    simpa using natDegree_pow_le_of_le k hlin
  have hcoeff : (momentPolynomial p f k).coeff k = 0 := by
    rw [moment_coeff]
    simp only [Nat.sub_self, pow_zero, mul_one, Nat.choose_self, Nat.cast_one, one_mul]
    rw [FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by simpa using hk), mul_zero]
  apply (degree_lt_iff_coeff_zero _ _).mpr
  intro i hi
  rcases hi.eq_or_lt with rfl | hi
  · exact hcoeff
  · exact coeff_eq_zero_of_natDegree_lt (hdeg.trans_lt hi)

private lemma moment_nonzero (p : ℕ) [Fact p.Prime] (f : ZMod p → ZMod p)
    (a b : ℕ) (hk : a + b < p)
    (hm : (∑ x : ZMod p, x ^ a * f x ^ b) ≠ 0) :
    momentPolynomial p f (a + b) ≠ 0 := by
  intro h
  have hc := congrArg (fun P : (ZMod p)[X] => P.coeff a) h
  rw [moment_coeff, coeff_zero, Nat.add_sub_cancel_left] at hc
  have hch : ((a + b).choose a : ZMod p) ≠ 0 := by
    rw [ne_eq, ZMod.natCast_eq_zero_iff]
    exact (Fact.out : p.Prime).coprime_iff_not_dvd.mp
      ((Fact.out : p.Prime).coprime_choose_of_lt hk (by omega))
  exact (mul_ne_zero (mul_ne_zero hch (pow_ne_zero _ (neg_ne_zero.mpr one_ne_zero))) hm) hc

private lemma missing_direction_root (p : ℕ) [Fact p.Prime]
    (f : ZMod p → ZMod p) (k : ℕ) (hk : k < p - 1) (m : ZMod p)
    (hm : ¬ ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)) :
    (momentPolynomial p f k).eval m = 0 := by
  classical
  have hinj : Function.Injective (fun x => f x - m * x) := by
    intro x y hxy
    by_contra hne
    apply hm
    refine ⟨x, y, hne, ?_⟩
    linear_combination hxy
  have hbij : Function.Bijective (fun x => f x - m * x) :=
    (Finite.injective_iff_bijective).mp hinj
  calc
    (momentPolynomial p f k).eval m = ∑ x : ZMod p, (f x - m * x) ^ k := by
      simp only [momentPolynomial, eval_finsetSum, eval_pow, eval_sub, eval_C, eval_mul, eval_X]
      apply Finset.sum_congr rfl
      intro x hx
      rw [mul_comm x m]
    _ = ∑ x : ZMod p, x ^ k := Fintype.sum_bijective _ hbij _ _ (fun _ => rfl)
    _ = 0 := FiniteField.sum_pow_lt_card_sub_one (ZMod p) k (by simpa using hk)

theorem problem2 (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := by
  classical
  obtain ⟨a, b, hkpos, hkbound, hm⟩ := moment_exists p hp f hf
  have hk : a + b < p - 1 := by omega
  have hne := moment_nonzero p f a b (by omega) hm
  have hdegree : (momentPolynomial p f (a + b)).natDegree < a + b :=
    (natDegree_lt_iff_degree_lt hne).mpr (moment_degree p f (a + b) hk)
  let D : Set (ZMod p) := {m | ∃ x y : ZMod p,
    x ≠ y ∧ f x - f y = m * (x - y)}
  have hcard : Dᶜ.ncard ≤ (momentPolynomial p f (a + b)).natDegree := by
    rw [Set.ncard_eq_toFinset_card']
    apply card_le_degree_of_subset_roots
    intro m hm
    apply (mem_roots hne).mpr
    apply missing_direction_root p f (a + b) hk m
    exact Set.mem_toFinset.mp hm
  have htotal := Set.ncard_add_ncard_compl D
  rw [Nat.card_zmod] at htotal
  change p + 3 ≤ 2 * D.ncard
  omega
