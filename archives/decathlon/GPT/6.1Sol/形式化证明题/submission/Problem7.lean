import Mathlib.LinearAlgebra.Lagrange
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.Algebra.MonoidAlgebra.Basic
import Mathlib.Data.Nat.Squarefree
import Mathlib.NumberTheory.ArithmeticFunction.Misc
import Mathlib.Algebra.Ring.GeomSum
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.LinearCombination
import Mathlib.Tactic.Ring

open Polynomial Finset

private lemma vanishing_dvd (p : ℕ) [Fact p.Prime] (P : (ZMod p)[X])
    (hP : ∀ x : ZMod p, P.eval x = 0) : (X ^ p - X) ∣ P := by
  classical
  have hp : 1 < p := (Fact.out : p.Prime).one_lt
  have hm : (X ^ p - X : (ZMod p)[X]).Monic :=
    monic_X_pow_sub (by simpa using hp)
  apply (modByMonic_eq_zero_iff_dvd hm).mp
  apply eq_zero_of_degree_lt_of_eval_finset_eq_zero (univ : Finset (ZMod p))
  · simpa [ZMod.card, degree_eq_natDegree hm.ne_zero,
      FiniteField.X_pow_card_sub_X_natDegree_eq (ZMod p) hp]
      using degree_modByMonic_lt P hm
  · intro x hx
    change eval₂ (RingHom.id _) x (P %ₘ (X ^ p - X)) = 0
    rw [eval₂_modByMonic_eq_self_of_root]
    · exact hP x
    · simp [ZMod.pow_card]

private lemma divisor_distribution (n p r : ℕ) [Fact p.Prime] [NeZero r]
    (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (p : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    (∑ d ∈ n.divisors, Finsupp.single (d : ZMod r) (1 : ZMod p)) =
      Finsupp.single (1 : ZMod r) (n.divisors.card : ZMod p) := by
  classical
  let P : (ZMod p)[X] := (∑ d ∈ n.divisors, X ^ d) - C (n.divisors.card : ZMod p) * X
  have hval : ∀ x : ZMod p, P.eval x = 0 := by
    intro x
    have h := (ZMod.intCast_zmod_eq_zero_iff_dvd
      ((∑ d ∈ n.divisors, (x.val : ℤ) ^ d) - (n.divisors.card : ℤ) * x.val) p).mpr
      (ha x.val)
    simpa [P, eval_sub, eval_finsetSum, eval_pow, eval_X, eval_mul, eval_C] using h
  have hd := vanishing_dvd p P hval
  let t : AddMonoidAlgebra (ZMod p) (ZMod r) := AddMonoidAlgebra.single 1 1
  have hcast : (p : ZMod r) = 1 := by
    simpa using (ZMod.natCast_eq_natCast_iff p 1 r).mpr hpr
  have ht : t ^ p = t := by
    simp only [t, AddMonoidAlgebra.single_pow, one_pow, nsmul_eq_mul, mul_one]
    exact congrArg (fun x : ZMod r => AddMonoidAlgebra.single x (1 : ZMod p)) hcast
  have hev : P.aeval t = 0 := by
    apply eval₂_eq_zero_of_dvd_of_eval₂_eq_zero _ _ hd
    simpa using sub_eq_zero.mpr ht
  have heq : (∑ d ∈ n.divisors, AddMonoidAlgebra.single (d : ZMod r) (1 : ZMod p)) =
      AddMonoidAlgebra.single (1 : ZMod r) (n.divisors.card : ZMod p) := by
    simp only [P, map_sub, map_mul, map_sum, map_pow, aeval_X, aeval_C] at hev
    have heq' := sub_eq_zero.mp hev
    simpa [P, t, map_sum, AddMonoidAlgebra.single_pow, nsmul_eq_mul,
      AddMonoidAlgebra.coe_algebraMap, AddMonoidAlgebra.natCast_def,
      AddMonoidAlgebra.single_mul_single] using heq'
  simpa [AddMonoidAlgebra.coeff_sum] using congrArg AddMonoidAlgebra.coeff heq

private lemma divisor_product (n r : ℕ) (hn : Squarefree n)
    {K : Type*} [CommSemiring K] :
    (∑ d ∈ n.divisors, MonoidAlgebra.single (d : ZMod r) (1 : K)) =
      ∏ q ∈ n.primeFactors, (1 + MonoidAlgebra.single (q : ZMod r) (1 : K)) := by
  classical
  rw [← Nat.divisors_filter_squarefree_of_squarefree hn,
    Nat.sum_divisors_filter_squarefree hn.ne_zero, Nat.factors_eq, Finset.prod_one_add]
  apply Finset.sum_congr rfl
  intro s hs
  simp only [MonoidAlgebra.prod_single, Finset.prod_const_one, Finset.prod_val, Nat.cast_prod, id_eq]

private lemma divisor_count_power (n : ℕ) (hn : Squarefree n) :
    n.divisors.card = 2 ^ n.primeFactors.card := by
  rw [Nat.card_divisors hn.ne_zero]
  have he : ∀ q ∈ n.primeFactors, n.factorization q + 1 = 2 := by
    intro q hq
    have hmem := Nat.mem_primeFactors.mp hq
    rw [Nat.factorization_eq_one_of_squarefree hn hmem.1 hmem.2.1]
  simp only [Finset.prod_congr rfl he, Finset.prod_const]

private lemma even_order_nonunit {K M : Type*} [CommRing K] [Nontrivial K] [CommMonoid M]
    (g : M) (hpos : 0 < orderOf g) (heven : Even (orderOf g)) :
    ¬ IsUnit (1 + MonoidAlgebra.single g (1 : K)) := by
  classical
  let a : MonoidAlgebra K M := MonoidAlgebra.single g 1
  let v := ∑ i ∈ Finset.range (orderOf g), (-a) ^ i
  have hv : v ≠ 0 := by
    intro hv
    have hc := congrArg (fun w : MonoidAlgebra K M => w.coeff 1) hv
    have hcoef : v.coeff 1 = 1 := by
      simp only [v, MonoidAlgebra.coeff_sum, Finsupp.finsetSum_apply]
      rw [Finset.sum_eq_single 0]
      · simp
      · intro i hi hi0
        have hgi : g ^ i ≠ 1 := by
          intro h
          have hd := orderOf_dvd_of_pow_eq_one h
          exact (Nat.not_dvd_of_pos_of_lt (Nat.pos_of_ne_zero hi0) (mem_range.mp hi)) hd
        have hneg : -a = MonoidAlgebra.single g (-1 : K) := by simp [a]
        rw [hneg, MonoidAlgebra.single_pow]
        simp [hgi]
      · intro h
        exact (h (mem_range.mpr hpos)).elim
    rw [hcoef] at hc
    exact (one_ne_zero : (1 : K) ≠ 0) (by simpa using hc)
  have hpow : (-a) ^ orderOf g = 1 := by
    rw [heven.neg_pow]
    dsimp [a]
    rw [MonoidAlgebra.single_pow, pow_orderOf_eq_one, one_pow, ← MonoidAlgebra.one_def]
  have hmul : (1 + a) * v = 0 := by
    have hgeom := mul_neg_geom_sum (-a) (orderOf g)
    simpa [v, hpow] using hgeom
  intro hu
  exact hv (hu.mul_left_cancel (by simpa using hmul))

private lemma basis_unit_zero_or_one (p r m : ℕ) [Fact p.Prime] [Fact r.Prime]
    (hf : r = 2 ^ (2 ^ m) + 1) (g : ZMod r)
    (hu : IsUnit (1 + MonoidAlgebra.single g (1 : ZMod p))) : g = 0 ∨ g = 1 := by
  by_cases hg : g = 0
  · exact Or.inl hg
  apply Or.inr
  have hd := ZMod.orderOf_dvd_card_sub_one hg
  have hrpow : r - 1 = 2 ^ (2 ^ m) := by
    simpa only [Nat.add_sub_cancel] using congrArg (fun x : ℕ => x - 1) hf
  rw [hrpow] at hd
  obtain ⟨k, hk, heq⟩ := (Nat.dvd_prime_pow Nat.prime_two).mp hd
  by_cases hk0 : k = 0
  · apply orderOf_eq_one_iff.mp
    simpa [hk0] using heq
  have hpos : 0 < orderOf g := by rw [heq]; positivity
  have heven : Even (orderOf g) := by
    rw [heq, even_iff_two_dvd]
    exact dvd_pow_self 2 hk0
  exact (even_order_nonunit g hpos heven hu).elim

private lemma prime_residues_one (n p r m : ℕ) [Fact p.Prime] [Fact r.Prime]
    (hs : Squarefree n) (hf : r = 2 ^ (2 ^ m) + 1) (hp2 : p ≠ 2)
    (hdist : (∑ d ∈ n.divisors, Finsupp.single (d : ZMod r) (1 : ZMod p)) =
      Finsupp.single (1 : ZMod r) (n.divisors.card : ZMod p)) :
    ∀ q ∈ n.primeFactors, (q : ZMod r) = 1 := by
  classical
  let F := fun q : ℕ => 1 + MonoidAlgebra.single (q : ZMod r) (1 : ZMod p)
  have hcount : (n.divisors.card : ZMod p) ≠ 0 := by
    rw [divisor_count_power n hs, Nat.cast_pow]
    apply pow_ne_zero
    rw [ne_eq, ZMod.natCast_eq_zero_iff]
    intro hd
    have hpe := (Nat.prime_dvd_prime_iff_eq (Fact.out : p.Prime) Nat.prime_two).mp hd
    exact hp2 hpe
  have hprod : (∏ q ∈ n.primeFactors, F q) =
      MonoidAlgebra.single (1 : ZMod r) (n.divisors.card : ZMod p) := by
    rw [← divisor_product n r hs]
    apply MonoidAlgebra.coeff_injective
    simpa [MonoidAlgebra.coeff_sum] using hdist
  have hunit : IsUnit (∏ q ∈ n.primeFactors, F q) := by
    rw [hprod]
    exact (isUnit_iff_ne_zero.mpr hcount).map MonoidAlgebra.singleOneRingHom
  have hzero_one : ∀ q ∈ n.primeFactors, (q : ZMod r) = 0 ∨ (q : ZMod r) = 1 := by
    intro q hq
    exact basis_unit_zero_or_one p r m hf (q : ZMod r) (IsUnit.prod_iff.mp hunit q hq)
  intro q hq
  rcases hzero_one q hq with hq0 | hq1
  · have hqr : r = q := (Nat.prime_dvd_prime_iff_eq (Fact.out : r.Prime)
        (Nat.mem_primeFactors.mp hq).1).mp ((ZMod.natCast_eq_zero_iff q r).mp hq0)
    have hothers : ∀ t ∈ n.primeFactors.erase q, (t : ZMod r) = 1 := by
      intro t ht
      rcases hzero_one t (mem_of_mem_erase ht) with ht0 | ht1
      · have htr : r = t := (Nat.prime_dvd_prime_iff_eq (Fact.out : r.Prime)
            (Nat.mem_primeFactors.mp (mem_of_mem_erase ht)).1).mp
            ((ZMod.natCast_eq_zero_iff t r).mp ht0)
        exact ((ne_of_mem_erase ht) (htr.symm.trans hqr)).elim
      · exact ht1
    have herase : (∏ t ∈ n.primeFactors.erase q, F t) =
        MonoidAlgebra.single (1 : ZMod r) ((2 : ZMod p) ^ (n.primeFactors.erase q).card) := by
      have he : ∀ t ∈ n.primeFactors.erase q,
          F t = MonoidAlgebra.single (1 : ZMod r) (2 : ZMod p) := by
        intro t ht
        simp [F, hothers t ht, MonoidAlgebra.one_def, ← MonoidAlgebra.single_add, one_add_one_eq_two]
      rw [Finset.prod_congr rfl he, Finset.prod_const, MonoidAlgebra.single_pow, one_pow]
    have hcoef := congrArg (fun v : MonoidAlgebra (ZMod p) (ZMod r) => v.coeff 0) hprod
    rw [← Finset.mul_prod_erase _ _ hq, herase] at hcoef
    have htwo : (2 : ZMod p) ≠ 0 := by
      change ¬ ((2 : ℕ) : ZMod p) = 0
      rw [ZMod.natCast_eq_zero_iff]
      intro hd
      exact hp2 ((Nat.prime_dvd_prime_iff_eq (Fact.out : p.Prime) Nat.prime_two).mp hd)
    simp [F, hq0, add_mul, MonoidAlgebra.single_mul_single, MonoidAlgebra.coeff_add,
      MonoidAlgebra.one_def] at hcoef
    exact (htwo hcoef.1).elim
  · exact hq1

theorem problem7 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  letI : Fact p.Prime := ⟨hp⟩
  letI : Fact r.Prime := ⟨hr⟩
  have hr3 : 3 ≤ r := by
    have hm : 1 ≤ 2 ^ m := Nat.one_le_pow _ _ (by omega)
    have hpow : 2 ≤ 2 ^ (2 ^ m) := Nat.le_pow hm
    omega
  have hp2 : p ≠ 2 := by
    intro hp2
    subst p
    have h := hpr
    change 2 % r = 1 % r at h
    rw [Nat.mod_eq_of_lt (by omega), Nat.mod_eq_of_lt (by omega)] at h
    omega
  have hdist := divisor_distribution n p r hpr (fun x =>
    dvd_trans (Int.natCast_dvd_natCast.mpr hpn) (ha x))
  have hprimes := prime_residues_one n p r m hs hf hp2 hdist
  intro d hd
  have hdsq : Squarefree d := hs.squarefree_of_dvd (Nat.dvd_of_mem_divisors hd)
  have hcast : (d : ZMod r) = 1 := by
    rw [← Nat.prod_primeFactors_of_squarefree hdsq, Nat.cast_prod]
    apply Finset.prod_eq_one
    intro q hq
    apply hprimes
    exact Nat.primeFactors_mono (Nat.dvd_of_mem_divisors hd) hs.ne_zero hq
  exact (ZMod.natCast_eq_natCast_iff d 1 r).mp (by simpa using hcast)
