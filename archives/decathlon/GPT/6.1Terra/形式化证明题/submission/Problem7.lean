import Mathlib.Data.Nat.Factors
import Mathlib.Data.ZMod.Basic
import Mathlib.Algebra.BigOperators.Group.Finset.Basic
import Mathlib.Algebra.Polynomial.BigOperators
import Mathlib.Algebra.Polynomial.Roots
import Mathlib.RingTheory.RootsOfUnity.PrimitiveRoots
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.Data.Nat.Squarefree
import Mathlib.Algebra.BigOperators.Ring.Finset
import Mathlib.NumberTheory.MulChar.Duality
import Mathlib.RingTheory.RootsOfUnity.AlgebraicallyClosed
import Mathlib.Tactic

open Finset

lemma divisor_sum_identity_mod (n p : ℕ) (hp : p.Prime) (hpn : p ∣ n)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    (z : ZMod p) :
    (∑ d ∈ n.divisors, z ^ d) = (n.divisors.card : ZMod p) * z := by
  letI : NeZero p := ⟨hp.ne_zero⟩
  have hpdiv : (p : ℤ) ∣ (n : ℤ) := by exact_mod_cast hpn
  have hdiv := dvd_trans hpdiv (ha (z.val : ℤ))
  have hzero : (((∑ d ∈ n.divisors, (z.val : ℤ) ^ d) -
      (n.divisors.card : ℤ) * (z.val : ℤ) : ℤ) : ZMod p) = 0 :=
    (ZMod.intCast_zmod_eq_zero_iff_dvd _ _).2 hdiv
  simpa only [Int.cast_sub, Int.cast_sum, Int.cast_pow, Int.cast_mul,
    Int.cast_natCast, ZMod.natCast_zmod_val, sub_eq_zero] using hzero

open Polynomial

lemma residue_polynomial_zero {K : Type*} [Field K]
    (D : Finset ℕ) (r : ℕ) (hr : 1 < r) (ζ : K) (hζ : IsPrimitiveRoot ζ r)
    (hF : ∀ z : K, (∑ d ∈ D, z ^ d) = (D.card : K) * z) :
    (∑ d ∈ D, (X : K[X]) ^ (d % r)) - C (D.card : K) * X = 0 := by
  classical
  let P : K[X] := (∑ d ∈ D, (X : K[X]) ^ (d % r)) - C (D.card : K) * X
  have hrpos : 0 < r := by omega
  have hsum : (∑ d ∈ D, (X : K[X]) ^ (d % r)).natDegree ≤ r - 1 := by
    apply natDegree_sum_le_of_forall_le
    intro d hd
    rw [natDegree_X_pow]
    exact Nat.le_pred_of_lt (Nat.mod_lt _ hrpos)
  have hterm : (C (D.card : K) * X).natDegree ≤ 1 := by
    calc
      _ ≤ (C (D.card : K)).natDegree + (X : K[X]).natDegree := natDegree_mul_le
      _ = 1 := by simp
  have hdeg : P.natDegree < r := by
    have hh := natDegree_sub_le (∑ d ∈ D, (X : K[X]) ^ (d % r)) (C (D.card : K) * X)
    dsimp only [P]
    have : max (∑ d ∈ D, (X : K[X]) ^ (d % r)).natDegree
      (C (D.card : K) * X).natDegree < r := max_lt (by omega) (by omega)
    exact hh.trans_lt this
  by_contra hP
  let S : Finset K := (range r).image (fun i => ζ ^ i)
  have hScard : S.card = r := by
    dsimp [S]
    rw [card_image_of_injOn]
    · simp
    · intro i hi j hj hij
      exact hζ.pow_inj (mem_range.mp hi) (mem_range.mp hj) hij
  have hsroot : S.val ⊆ P.roots := by
    intro z hz
    have hzS : z ∈ S := by simpa using hz
    obtain ⟨i, hi, rfl⟩ := mem_image.mp hzS
    apply (Polynomial.mem_roots hP).2
    have hzpow : (ζ ^ i) ^ r = 1 := by
      rw [← pow_mul, Nat.mul_comm, pow_mul, hζ.pow_eq_one, one_pow]
    change P.eval (ζ ^ i) = 0
    dsimp only [P]
    simp only [eval_sub, eval_finsetSum, eval_pow, eval_X, eval_mul, eval_C, sub_eq_zero]
    calc
      (∑ d ∈ D, (ζ ^ i) ^ (d % r)) = ∑ d ∈ D, (ζ ^ i) ^ d := by
        apply Finset.sum_congr rfl
        intro d hd
        exact pow_eq_pow_of_modEq (Nat.mod_modEq d r) hzpow
      _ = (D.card : K) * ζ ^ i := hF _
  have hle := Polynomial.card_le_degree_of_subset_roots hsroot
  rw [hScard] at hle
  omega

lemma residue_count_zero {K : Type*} [Field K]
    (D : Finset ℕ) (r : ℕ) (hr : 1 < r) (ζ : K) (hζ : IsPrimitiveRoot ζ r)
    (hF : ∀ z : K, (∑ d ∈ D, z ^ d) = (D.card : K) * z)
    (j : ℕ) (hj : j ≠ 1) :
    ((D.filter fun d => d % r = j).card : K) = 0 := by
  classical
  have hp := residue_polynomial_zero D r hr ζ hζ hF
  have hc := congrArg (fun P : K[X] => P.coeff j) hp
  have hc' : (∑ d ∈ D, if d % r = j then (1 : K) else 0) = 0 := by
    simpa only [coeff_sub, finsetSum_coeff, coeff_X_pow, coeff_C_mul_X,
      hj, if_false, sub_zero, coeff_zero, eq_comm] using hc
  simpa [← Finset.sum_filter] using hc'

lemma prime_primitive_root_exists (p r : ℕ) (hp : p.Prime) (hr : r.Prime)
    (hpr : Nat.ModEq r p 1) : ∃ ζ : ZMod p, IsPrimitiveRoot ζ r := by
  letI : Fact p.Prime := ⟨hp⟩
  letI : Fact r.Prime := ⟨hr⟩
  have hrdiv : r ∣ Fintype.card (ZMod p)ˣ := by
    rw [ZMod.card_units]
    exact (Nat.modEq_iff_dvd' (by have := hp.two_le; omega : 1 ≤ p)).mp hpr.symm
  obtain ⟨u, hu⟩ := exists_prime_orderOf_dvd_card r hrdiv
  refine ⟨(u : ZMod p), ?_⟩
  rw [IsPrimitiveRoot.iff_orderOf, orderOf_units]
  exact hu

lemma divisor_residue_count_dvd (n p r : ℕ) (hp : p.Prime) (hr : r.Prime)
    (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    (j : ℕ) (hj : j ≠ 1) : p ∣ (n.divisors.filter fun d => d % r = j).card := by
  letI : Fact p.Prime := ⟨hp⟩
  obtain ⟨ζ, hζ⟩ := prime_primitive_root_exists p r hp hr hpr
  have hc := residue_count_zero n.divisors r hr.one_lt ζ hζ
    (divisor_sum_identity_mod n p hp hpn ha) j hj
  rw [← CharP.cast_eq_zero_iff (ZMod p)]
  exact hc

lemma squarefree_divisor_sum_product {K : Type*} [CommSemiring K] (n : ℕ)
    (hn : Squarefree n) (f : ℕ →* K) :
    (∑ d ∈ n.divisors, f d) =
      ∏ q ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset, (1 + f q) := by
  classical
  have h := Nat.sum_divisors_filter_squarefree (α := K) (f := fun d => f d) hn.ne_zero
  rw [Nat.divisors_filter_squarefree_of_squarefree hn] at h
  rw [h, Finset.prod_one_add]
  apply Finset.sum_congr rfl
  intro t ht
  simpa only [Finset.prod_eq_multiset_prod] using map_multiset_prod f t.val

lemma squarefree_divisors_card (n : ℕ) (hn : Squarefree n) :
    n.divisors.card = 2 ^ (UniqueFactorizationMonoid.normalizedFactors n).toFinset.card := by
  classical
  have h := Nat.sum_divisors_filter_squarefree (α := ℕ) (f := fun _ => 1) hn.ne_zero
  rw [Nat.divisors_filter_squarefree_of_squarefree hn] at h
  simpa using h
lemma divisor_weighted_sum {K : Type*} [CommRing K] (n p r : ℕ)
    (hp : p.Prime) (hr : r.Prime) (hpn : p ∣ n)
    (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    [CharP K p] (F : ZMod r → K) :
    (∑ d ∈ n.divisors, F (d : ZMod r)) = (n.divisors.card : K) * F 1 := by
  classical
  have hmap : ∀ d ∈ n.divisors, d % r ∈ Finset.range r := by
    intro d hd
    exact Finset.mem_range.mpr (Nat.mod_lt _ hr.pos)
  have hzero : (∑ d ∈ n.divisors, (F (d : ZMod r) - F 1)) = 0 := by
    have hgroup := Finset.sum_fiberwise_of_maps_to' hmap
      (fun j : ℕ => F (j : ZMod r) - F 1)
    simp only [ZMod.natCast_mod] at hgroup
    rw [← hgroup]
    apply Finset.sum_eq_zero
    intro j hj
    by_cases h : j = 1
    · subst j
      simp
    · have hc : ((n.divisors.filter fun d => d % r = j).card : K) = 0 := by
        apply (CharP.cast_eq_zero_iff K p _).2
        exact divisor_residue_count_dvd n p r hp hr hpn hpr ha j h
      simp only [Finset.sum_const, nsmul_eq_mul, hc, zero_mul]
  simpa only [Finset.sum_sub_distrib, Finset.sum_const, nsmul_eq_mul, sub_eq_zero] using hzero
lemma no_negative_prime_factor {K : Type*} [Field K] (n p r : ℕ)
    (hs : Squarefree n) (hp : p.Prime) (hr : r.Prime) (hpn : p ∣ n)
    (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    [CharP K p] (h2 : (2 : K) ≠ 0) (f : ZMod r →* K)
    (q : ℕ) (hq : q ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset) :
    f (q : ZMod r) ≠ -1 := by
  intro hqf
  let g : ℕ →* K := f.comp ((Nat.castRingHom (ZMod r)).toMonoidHom)
  have hprod := squarefree_divisor_sum_product n hs g
  have hzero : (∏ t ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset,
      (1 + g t)) = 0 := by
    apply Finset.prod_eq_zero hq
    simp [g, hqf]
  rw [hzero] at hprod
  have hsum := divisor_weighted_sum n p r hp hr hpn hpr ha (fun z => f z)
  simp only [map_one, mul_one] at hsum
  have hprod' : (∑ d ∈ n.divisors, f (d : ZMod r)) = 0 := by
    simpa [g] using hprod
  have hc : (n.divisors.card : K) = 0 := hsum.symm.trans hprod'
  rw [squarefree_divisors_card n hs, Nat.cast_pow, Nat.cast_ofNat] at hc
  exact (pow_ne_zero _ h2) hc
lemma two_power_root_neg_one {K : Type*} [Field K] (x : K) (k : ℕ)
    (hx : x ^ (2 ^ k) = 1) (hne : x ≠ 1) : ∃ e : ℕ, x ^ e = -1 := by
  induction k with
  | zero =>
    simp only [pow_zero, pow_one] at hx
    exact (hne hx).elim
  | succ k ih =>
    by_cases h : x ^ (2 ^ k) = 1
    · exact ih h
    · have hsq : (x ^ (2 ^ k)) ^ 2 = 1 := by
        rw [← pow_mul, ← pow_succ]
        exact hx
      exact ⟨2 ^ k, (sq_eq_one_iff.mp hsq).resolve_left h⟩
lemma exists_negative_character {K : Type*} [Field K] (r k : ℕ) (hr : r.Prime)
    (hpow : r - 1 = 2 ^ k)
    [HasEnoughRootsOfUnity K (Monoid.exponent (ZMod r)ˣ)]
    (a : ZMod r) (ha0 : a ≠ 0) (ha1 : a ≠ 1) :
    ∃ f : ZMod r →* K, f a = -1 := by
  letI : Fact r.Prime := ⟨hr⟩
  obtain ⟨χ, hχ⟩ := MulChar.exists_apply_ne_one_of_hasEnoughRootsOfUnity (ZMod r) K ha1
  have hx : (χ a) ^ (2 ^ k) = 1 := by
    rw [← hpow, ← map_pow, ZMod.pow_card_sub_one_eq_one ha0, map_one]
  obtain ⟨e, he⟩ := two_power_root_neg_one (χ a) k hx hχ
  refine ⟨χ.toMonoidHom ^ e, ?_⟩
  simpa using he
lemma no_unique_zero_factor {K : Type*} [Field K] (n p r : ℕ)
    (hs : Squarefree n) (hp : p.Prime) (hr : r.Prime) (hpn : p ∣ n)
    (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    [CharP K p] (h2 : (2 : K) ≠ 0) (f : ZMod r →* K)
    (q : ℕ) (hq : q ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset)
    (hq0 : f (q : ZMod r) = 0)
    (hother : ∀ t ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset,
      t ≠ q → f (t : ZMod r) = 1) : False := by
  classical
  let s := (UniqueFactorizationMonoid.normalizedFactors n).toFinset
  let g : ℕ →* K := f.comp (Nat.castRingHom (ZMod r)).toMonoidHom
  have hprod := squarefree_divisor_sum_product n hs g
  have hsum := divisor_weighted_sum n p r hp hr hpn hpr ha (fun z => f z)
  simp only [map_one, mul_one] at hsum
  have hprod' : (∑ d ∈ n.divisors, f (d : ZMod r)) = ∏ t ∈ s, (1 + g t) := by
    simpa [s, g] using hprod
  have heval : (n.divisors.card : K) = ∏ t ∈ s, (1 + g t) := hsum.symm.trans hprod'
  have herase : (∏ t ∈ s.erase q, (1 + g t)) = (2 : K) ^ (s.erase q).card := by
    calc
      _ = ∏ _t ∈ s.erase q, (2 : K) := by
        apply Finset.prod_congr rfl
        intro t ht
        have hmem := Finset.mem_erase.mp ht
        simp [g, hother t hmem.2 hmem.1, one_add_one_eq_two]
      _ = _ := by simp
  have hcast : (n.divisors.card : K) = (2 : K) ^ s.card := by
    simp [s, squarefree_divisors_card n hs]
  have heq : (2 : K) ^ s.card = (2 : K) ^ (s.erase q).card := by
    rw [← hcast, heval, ← Finset.mul_prod_erase s (fun t => 1 + g t) hq]
    simpa [g, hq0] using herase
  have hcard : (s.erase q).card + 1 = s.card := Finset.card_erase_add_one hq
  rw [← hcard, pow_succ] at heq
  have hne : (2 : K) ^ (s.erase q).card ≠ 0 := pow_ne_zero _ h2
  apply hne
  linear_combination heq
lemma fermat_congruence_prime_ne_two (p r m : ℕ) (hr : r.Prime)
    (hf : r = 2 ^ (2 ^ m) + 1) (hpr : Nat.ModEq r p 1) : p ≠ 2 := by
  have hpow : 1 < 2 ^ (2 ^ m) := Nat.one_lt_pow (by positivity) (by decide)
  have hr3 : 2 < r := by omega
  intro hp2
  subst p
  change 2 % r = 1 % r at hpr
  rw [Nat.mod_eq_of_lt hr3, Nat.mod_eq_of_lt (by omega : 1 < r)] at hpr
  omega

lemma fermat_enough_roots (p r m : ℕ) [Fact p.Prime] (hp : p.Prime) (hr : r.Prime)
    (hf : r = 2 ^ (2 ^ m) + 1) (hpr : Nat.ModEq r p 1) :
    HasEnoughRootsOfUnity (AlgebraicClosure (ZMod p)) (Monoid.exponent (ZMod r)ˣ) := by
  letI : NeZero r := ⟨hr.ne_zero⟩
  letI : Fact r.Prime := ⟨hr⟩
  have hp2 := fermat_congruence_prime_ne_two p r m hr hf hpr
  have hdiv : Monoid.exponent (ZMod r)ˣ ∣ 2 ^ (2 ^ m) := by
    have h := Group.exponent_dvd_card (G := (ZMod r)ˣ)
    rw [ZMod.card_units] at h
    simpa [hf] using h
  have hnonzero : (Monoid.exponent (ZMod r)ˣ : ZMod p) ≠ 0 := by
    intro hz
    have hd : p ∣ Monoid.exponent (ZMod r)ˣ := (CharP.cast_eq_zero_iff (ZMod p) p _).mp hz
    have hpdiv : p ∣ 2 ^ (2 ^ m) := dvd_trans hd hdiv
    exact hp2 ((Nat.prime_dvd_prime_iff_eq hp Nat.prime_two).mp (hp.dvd_of_dvd_pow hpdiv))
  letI : NeZero (Monoid.exponent (ZMod r)ˣ : ZMod p) := ⟨hnonzero⟩
  infer_instance
lemma prime_factors_residue_one {K : Type*} [Field K] (n p r m : ℕ)
    (hs : Squarefree n) (hp : p.Prime) (hr : r.Prime)
    (hf : r = 2 ^ (2 ^ m) + 1) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    [CharP K p] [HasEnoughRootsOfUnity K (Monoid.exponent (ZMod r)ˣ)]
    (h2 : (2 : K) ≠ 0) (q : ℕ)
    (hq : q ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset) :
    (q : ZMod r) = 1 := by
  classical
  letI : Fact r.Prime := ⟨hr⟩
  have hqprime : q.Prime := Nat.prime_iff.mpr
    (UniqueFactorizationMonoid.prime_of_normalized_factor q (Multiset.mem_toFinset.mp hq))
  by_contra hbad
  by_cases hq0 : (q : ZMod r) = 0
  · have hqr : q = r := ((Nat.prime_dvd_prime_iff_eq hr hqprime).mp
      ((ZMod.natCast_eq_zero_iff q r).mp hq0)).symm
    let χ : MulChar (ZMod r) K := 1
    apply no_unique_zero_factor n p r hs hp hr hpn hpr ha h2 χ.toMonoidHom q hq
    · change χ (q : ZMod r) = 0
      rw [hq0, MulChar.map_zero]
    · intro t ht htq
      have htprime : t.Prime := Nat.prime_iff.mpr
        (UniqueFactorizationMonoid.prime_of_normalized_factor t (Multiset.mem_toFinset.mp ht))
      have ht0 : (t : ZMod r) ≠ 0 := by
        intro h
        have heq : r = t := (Nat.prime_dvd_prime_iff_eq hr htprime).mp
          ((ZMod.natCast_eq_zero_iff t r).mp h)
        exact htq (by omega)
      change χ (t : ZMod r) = 1
      exact MulChar.one_apply (isUnit_iff_ne_zero.mpr ht0)
  · have hrpow : r - 1 = 2 ^ (2 ^ m) := by simp [hf]
    obtain ⟨f, hneg⟩ := exists_negative_character (K := K) r (2 ^ m) hr hrpow (q : ZMod r) hq0 hbad
    exact no_negative_prime_factor n p r hs hp hr hpn hpr ha h2 f q hq hneg
lemma divisor_residue_one_of_prime_factors (n r : ℕ) (hn : n ≠ 0)
    (hfac : ∀ q ∈ (UniqueFactorizationMonoid.normalizedFactors n).toFinset,
      (q : ZMod r) = 1) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  intro d hd
  have hdn : d ∣ n := Nat.dvd_of_mem_divisors hd
  have hd0 : d ≠ 0 := by
    intro hd0
    subst d
    exact hn (Nat.eq_zero_of_zero_dvd hdn)
  have heq : (UniqueFactorizationMonoid.normalizedFactors d).prod = d :=
    associated_iff_eq.mp (UniqueFactorizationMonoid.prod_normalizedFactors hd0)
  have hprod : (((UniqueFactorizationMonoid.normalizedFactors d).prod : ℕ) : ZMod r) = 1 := by
    let g : ℕ →* ZMod r := (Nat.castRingHom (ZMod r)).toMonoidHom
    change g (UniqueFactorizationMonoid.normalizedFactors d).prod = 1
    rw [map_multiset_prod]
    apply Multiset.prod_eq_one
    intro x hx
    obtain ⟨q, hq, rfl⟩ := Multiset.mem_map.mp hx
    apply hfac q
    apply Multiset.mem_toFinset.mpr
    apply (UniqueFactorizationMonoid.mem_normalizedFactors_iff hn).mpr
    exact ⟨UniqueFactorizationMonoid.prime_of_normalized_factor q hq,
      dvd_trans (UniqueFactorizationMonoid.dvd_of_mem_normalizedFactors hq) hdn⟩
  apply (ZMod.natCast_eq_natCast_iff d 1 r).mp
  simpa [heq] using hprod
theorem problem7 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  letI : Fact p.Prime := ⟨hp⟩
  let K := AlgebraicClosure (ZMod p)
  have hp2 : p ≠ 2 := fermat_congruence_prime_ne_two p r m hr hf hpr
  have h2 : (2 : ZMod p) ≠ 0 := by
    intro h
    have hd : p ∣ 2 := (ZMod.natCast_eq_zero_iff 2 p).mp h
    exact hp2 ((Nat.prime_dvd_prime_iff_eq hp Nat.prime_two).mp hd)
  have h2K : (2 : K) ≠ 0 := by
    intro h
    have hh : algebraMap (ZMod p) K (2 : ZMod p) = algebraMap (ZMod p) K 0 := by
      rw [map_ofNat, map_zero]
      exact h
    exact h2 ((algebraMap (ZMod p) K).injective hh)
  letI : HasEnoughRootsOfUnity K (Monoid.exponent (ZMod r)ˣ) :=
    fermat_enough_roots p r m hp hr hf hpr
  apply divisor_residue_one_of_prime_factors n r (by omega)
  intro q hq
  exact prime_factors_residue_one n p r m hs hp hr hf hpn hpr ha h2K q hq