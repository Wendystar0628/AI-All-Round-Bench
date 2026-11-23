import Mathlib.Data.Nat.Squarefree
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.RingTheory.RootsOfUnity.PrimitiveRoots
import Mathlib.Algebra.BigOperators.Ring.Finset

open Polynomial Finset

private lemma p5_divisor_weights (n p r : ℕ) [Fact p.Prime] [Fact r.Prime]
    (hr : 1 < r) (hpr : r ∣ p - 1) (hpn : p ∣ n)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    (w : ZMod r → ZMod p) :
    ∑ d ∈ n.divisors, w (d : ZMod r) = (n.divisors.card : ZMod p) * w 1 := by
  classical
  have hcard : r ∣ Fintype.card (ZMod p)ˣ := by rwa [Fintype.card_units, ZMod.card]
  obtain ⟨u, hu⟩ := exists_prime_orderOf_dvd_card r hcard
  let z : ZMod p := u
  have hz : orderOf z = r := orderOf_units.trans hu
  have hprim := IsPrimitiveRoot.iff_orderOf.mpr hz
  let P : (ZMod p)[X] := ∑ d ∈ n.divisors, monomial (d % r) 1
  let Q : (ZMod p)[X] := monomial 1 (n.divisors.card : ZMod p)
  have hPQ : P = Q := by
    by_contra h
    have hn : P - Q ≠ 0 := sub_ne_zero.mpr h
    let S := (Finset.range r).image (fun i => z ^ i)
    have hc : S.card = r := by
      rw [Finset.card_image_of_injOn, Finset.card_range]
      intro i hi j hj hij
      exact hprim.pow_inj (Finset.mem_range.mp hi) (Finset.mem_range.mp hj) hij
    have hroots : S.card ≤ (P - Q).natDegree := by
      apply card_le_degree_of_subset_roots
      intro x hx
      obtain ⟨i, hi, rfl⟩ := Finset.mem_image.mp (Finset.mem_def.mpr hx)
      apply (mem_roots hn).mpr
      have hdiv : (p : ℤ) ∣ (∑ d ∈ n.divisors, ((z ^ i).val : ℤ) ^ d) -
          (n.divisors.card : ℤ) * (z ^ i).val :=
        (Int.natCast_dvd_natCast.mpr hpn).trans (ha _)
      have hsum := (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).mpr hdiv
      simp only [Int.cast_sub, Int.cast_sum, Int.cast_pow, Int.cast_natCast,
        Int.cast_mul, ZMod.natCast_zmod_val] at hsum
      simp only [IsRoot, eval_sub, P, Q, eval_finsetSum, eval_monomial, one_mul, pow_one]
      convert hsum using 2
      apply Finset.sum_congr rfl
      intro d hd
      rw [← pow_mul, Nat.mul_comm i, pow_mul, ← hz, pow_mod_orderOf, ← pow_mul, Nat.mul_comm, pow_mul]
    have hP : P.natDegree ≤ r - 1 := by
      apply natDegree_sum_le_of_forall_le
      intro d hd
      exact (natDegree_monomial_le _).trans (by have := Nat.mod_lt d (by omega : 0 < r); omega)
    have hQ : Q.natDegree ≤ r - 1 := (natDegree_monomial_le _).trans (by omega)
    have hdeg := natDegree_sub_le_of_le hP hQ
    omega
  have H := congrArg (fun R : (ZMod p)[X] =>
    ∑ i ∈ Finset.range r, R.coeff i * w (i : ZMod r)) hPQ
  dsimp [P, Q] at H
  simp only [finsetSum_coeff, Finset.sum_mul] at H
  rw [Finset.sum_comm] at H
  simpa [coeff_monomial, ite_mul, hr, Nat.mod_lt _ (by omega : 0 < r), ZMod.natCast_mod] using H

private lemma p5_divisors_image (n : ℕ) (hs : Squarefree n) :
    n.divisors = n.primeFactors.powerset.image (fun t => ∏ q ∈ t, q) ∧
      Set.InjOn (fun t : Finset ℕ => ∏ q ∈ t, q) (↑n.primeFactors.powerset) := by
  have hprime (t : Finset ℕ) (ht : t ⊆ n.primeFactors) :
      (∏ q ∈ t, q).primeFactors = t :=
    Nat.primeFactors_prod fun q hq => Nat.prime_of_mem_primeFactors (ht hq)
  constructor
  · ext d
    constructor
    · intro hd
      have hdv := Nat.dvd_of_mem_divisors hd
      exact Finset.mem_image.mpr ⟨d.primeFactors, Finset.mem_powerset.mpr
        (Nat.primeFactors_mono hdv hs.ne_zero),
        Nat.prod_primeFactors_of_squarefree (hs.squarefree_of_dvd hdv)⟩
    · intro hd
      obtain ⟨t, ht, rfl⟩ := Finset.mem_image.mp hd
      exact Nat.mem_divisors.mpr ⟨(Finset.prod_dvd_prod_of_subset _ _ _
        (Finset.mem_powerset.mp ht)).trans (dvd_of_eq (Nat.prod_primeFactors_of_squarefree hs)),
        hs.ne_zero⟩
  · intro t ht v hv he
    simpa only [hprime t (Finset.mem_powerset.mp ht), hprime v (Finset.mem_powerset.mp hv)] using
      congrArg Nat.primeFactors he

private lemma p5_sign_prod {p r : ℕ} [Fact p.Prime] [Fact r.Prime] {t : Finset ℕ}
    (hneg : (-1 : ZMod r) ≠ 1) (v : ℕ → ZMod r)
    (hv : ∀ q ∈ t, v q ^ 2 = 1) :
    (if (∏ q ∈ t, v q) = 1 then (1 : ZMod p) else -1) =
      ∏ q ∈ t, if v q = 1 then (1 : ZMod p) else -1 := by
  classical
  induction t using Finset.induction_on with
  | empty => simp
  | @insert a t ha ih =>
    have ht : ∀ q ∈ t, v q ^ 2 = 1 := fun q hq => hv q (Finset.mem_insert_of_mem hq)
    have hT : (∏ q ∈ t, v q) ^ 2 = 1 := by
      rw [← Finset.prod_pow]
      exact Finset.prod_eq_one ht
    rw [Finset.prod_insert ha, Finset.prod_insert ha, ← ih ht]
    rcases sq_eq_one_iff.mp (hv a (Finset.mem_insert_self ..)) with hA | hA <;>
      rcases sq_eq_one_iff.mp hT with hB | hB <;> simp [hA, hB, hneg]

theorem problem5 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  classical
  letI : Fact p.Prime := ⟨hp⟩
  letI : Fact r.Prime := ⟨hr⟩
  have hr2 : 2 < r := by
    have hj : 0 < (2 : ℕ) ^ m := by positivity
    have hpow : 2 ≤ (2 : ℕ) ^ (2 ^ m) := by
      simpa using Nat.pow_le_pow_right (by decide : 0 < (2 : ℕ)) (show 1 ≤ 2 ^ m by omega)
    omega
  have hpr' : r ∣ p - 1 := (Nat.modEq_iff_dvd' hp.one_lt.le).mp hpr.symm
  have hp2 : 2 < p := by
    have hh := Nat.le_of_dvd (show 0 < p - 1 from Nat.sub_pos_of_lt hp.one_lt) hpr'
    omega
  have hpnon : (2 : ZMod p) ≠ 0 := by
    rw [← Nat.cast_two, ne_eq, ZMod.natCast_eq_zero_iff]
    exact Nat.not_dvd_of_pos_of_lt (by decide) hp2
  have hneg : (-1 : ZMod r) ≠ 1 := by
    intro h
    have h' : (2 : ZMod r) = 0 := by linear_combination -h
    rw [← Nat.cast_two, ZMod.natCast_eq_zero_iff] at h'
    exact Nat.not_dvd_of_pos_of_lt (by decide) hr2 h'
  obtain ⟨him, hinj⟩ := p5_divisors_image n hs
  let s := n.primeFactors
  have hsum (w : ZMod r → ZMod p) (hw : w 1 = 1) :
      ∑ t ∈ s.powerset, w (∏ q ∈ t, (q : ZMod r)) = (2 : ZMod p) ^ s.card := by
    have h := p5_divisor_weights n p r hr.one_lt hpr' hpn ha w
    rw [hw, mul_one, him, Finset.card_image_of_injOn hinj, Finset.card_powerset,
      Finset.sum_image hinj, Nat.cast_pow, Nat.cast_two] at h
    simpa [s, Nat.cast_prod] using h
  have hall : ∀ q ∈ s, (q : ZMod r) ≠ 0 := by
    intro q hq hqz
    let W : ZMod r → ZMod p := fun x => if x = 0 then 0 else 1
    have hW := hsum W (by simp [W])
    have hprod : ∀ t : Finset ℕ,
        W (∏ a ∈ t, (a : ZMod r)) = ∏ a ∈ t, W (a : ZMod r) := by
      intro t
      by_cases hz : ∃ a ∈ t, (a : ZMod r) = 0
      · obtain ⟨a, ha, haz⟩ := hz
        rw [Finset.prod_eq_zero ha haz, Finset.prod_eq_zero ha (show W a = 0 by simp [W, haz])]
        simp [W]
      · have hne (a : ℕ) (ha : a ∈ t) : (a : ZMod r) ≠ 0 :=
          fun h => hz ⟨a, ha, h⟩
        calc
          W (∏ a ∈ t, (a : ZMod r)) = 1 := by simp [W, Finset.prod_ne_zero_iff.mpr hne]
          _ = ∏ a ∈ t, W (a : ZMod r) := (Finset.prod_eq_one (by
            intro a ha
            simp [W, hne a ha])).symm
    simp only [hprod, ← Finset.prod_one_add] at hW
    rw [← Finset.prod_erase_mul _ _ hq] at hW
    have hconst : (∏ a ∈ s.erase q, (1 + W (a : ZMod r))) =
        (2 : ZMod p) ^ (s.erase q).card := by
      rw [← Finset.prod_const]
      apply Finset.prod_congr rfl
      intro a ha
      have haq : a ≠ q := Finset.ne_of_mem_erase ha
      have ha0 : (a : ZMod r) ≠ 0 := by
        rw [ne_eq, ZMod.natCast_eq_zero_iff]
        intro hd
        have hA := Nat.prime_of_mem_primeFactors (Finset.mem_of_mem_erase ha : a ∈ n.primeFactors)
        have hQ := Nat.prime_of_mem_primeFactors (hq : q ∈ n.primeFactors)
        exact haq (((hA.dvd_iff_eq hr.ne_one).mp hd).trans
          ((hQ.dvd_iff_eq hr.ne_one).mp ((ZMod.natCast_eq_zero_iff q r).mp hqz)).symm)
      simp [W, ha0, one_add_one_eq_two]
    rw [hconst, show W q = 0 by simp [W, hqz], add_zero, mul_one,
      ← Finset.card_erase_add_one hq, pow_succ] at hW
    have hne := pow_ne_zero (s.erase q).card hpnon
    exact one_ne_zero (show (1 : ZMod p) = 0 by
      apply (mul_right_inj' hne).mp
      linear_combination -hW)
  let H : ℕ → Prop := fun k => ∀ q ∈ s, (q : ZMod r) ^ (2 ^ k) = 1
  have hex : ∃ k, H k := ⟨2^m, by
    intro q hq
    have h := ZMod.pow_card_sub_one_eq_one (hall q hq)
    simpa [hf] using h⟩
  let k := Nat.find hex
  have hk : H k := Nat.find_spec hex
  have hk0 : k = 0 := by
    by_contra h
    obtain ⟨l, hl⟩ := Nat.exists_eq_succ_of_ne_zero h
    have hsq (q : ℕ) (hq : q ∈ s) : ((q : ZMod r) ^ (2 ^ l)) ^ 2 = 1 := by
      rw [← pow_mul, ← pow_succ]
      have hh : (q : ZMod r) ^ (2 ^ k) = 1 := hk q hq
      rw [hl] at hh
      exact hh
    have hb : ¬ H l := Nat.find_min hex (by omega)
    simp only [H] at hb
    push Not at hb
    obtain ⟨q, hq, hqne⟩ := hb
    let W : ZMod r → ZMod p := fun x => if x ^ (2 ^ l) = 1 then 1 else -1
    have hw := hsum W (by simp [W])
    have hW (t : Finset ℕ) (ht : t ∈ s.powerset) :
        W (∏ a ∈ t, (a : ZMod r)) = ∏ a ∈ t, W a := by
      dsimp only [W]
      rw [← Finset.prod_pow]
      exact p5_sign_prod hneg _ fun a ha => hsq a (Finset.mem_powerset.mp ht ha)
    have hsum' := Finset.sum_congr rfl hW
    rw [hsum', ← Finset.prod_one_add, Finset.prod_eq_zero hq
      (show 1 + W q = 0 by simp [W, hqne])] at hw
    exact pow_ne_zero _ hpnon hw.symm
  intro d hd
  have hdv := Nat.dvd_of_mem_divisors hd
  have hsub := Nat.primeFactors_mono hdv hs.ne_zero
  have hd' : (d : ZMod r) = 1 := by
    rw [← Nat.prod_primeFactors_of_squarefree (hs.squarefree_of_dvd hdv), Nat.cast_prod]
    apply Finset.prod_eq_one
    intro q hq
    have hh := hk q (hsub hq)
    simpa [hk0] using hh
  exact (ZMod.natCast_eq_natCast_iff d 1 r).mp (by simpa using hd')

#print axioms problem5
