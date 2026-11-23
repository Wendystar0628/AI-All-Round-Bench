import Mathlib.LinearAlgebra.Lagrange
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.NumberTheory.ArithmeticFunction.Misc
import Mathlib.Data.Nat.Squarefree
import Mathlib.Tactic

open Finset Polynomial
private lemma testResidues {p r n : ℕ} [Fact p.Prime] (hp : 2 < p) (hrp : r ∣ p-1)
    (he : ∀ x : ZMod p, ∑ d ∈ n.divisors,x^d = (n.divisors.card : ZMod p)*x)
    (g : ZMod r → ZMod p) :
    ∑ d ∈ n.divisors,g d = (n.divisors.card : ZMod p)*g 1 := by
  classical
  let e (d : ℕ) := (d-1)%(p-1)+1
  have heq (d) (hd : d ∈ n.divisors) : Nat.ModEq (p-1) (e d) d := by
    have := (Nat.mod_modEq (d-1) (p-1)).add_right 1
    simpa [e,Nat.sub_add_cancel (Nat.pos_of_mem_divisors hd)] using this
  have hpoly : (∑ d ∈ n.divisors, monomial (e d) (1 : ZMod p)) =
      monomial 1 (n.divisors.card : ZMod p) := by
    apply eq_of_degrees_lt_of_eval_finset_eq univ
    · simp only [card_univ,ZMod.card]
      have H : (∑ d ∈ n.divisors, monomial (e d) (1 : ZMod p)).natDegree ≤ p-1 := by
        apply natDegree_sum_le_of_forall_le
        intro d _
        apply (natDegree_monomial_le _).trans
        have := Nat.mod_lt (d-1) (show 0 < p-1 by omega)
        dsimp [e]; omega
      have HH := H.trans_lt (show p-1 < p by omega)
      exact degree_le_natDegree.trans_lt (by exact_mod_cast HH)
    · simp only [card_univ,ZMod.card]
      exact (degree_monomial_le ..).trans_lt (WithBot.coe_lt_coe.mpr (show 1 < p by omega))
    · intro x hx
      simp only [eval_finsetSum,eval_monomial,one_mul,pow_one]
      rw [← he]
      apply sum_congr rfl
      intro d hd
      by_cases h : x = 0
      · simp [h,e,zero_pow (Nat.pos_of_mem_divisors hd).ne']
      · exact pow_eq_pow_of_modEq (heq d hd) (ZMod.pow_card_sub_one_eq_one h)
  let L := Polynomial.lsum (R := ZMod p) (fun j => (g (j : ZMod r)) • LinearMap.id (R := ZMod p) (M := ZMod p))
  have hm (j : ℕ) (a : ZMod p) : L (monomial j a) = g j * a := by
    simp [L,Polynomial.lsum_apply,Polynomial.sum_monomial_index]
  have H := congrArg L hpoly
  rw [map_sum,hm] at H
  simp_rw [hm,mul_one] at H
  rw [mul_comm]
  convert H using 1
  · apply sum_congr rfl
    intro d hd
    rw [(ZMod.natCast_eq_natCast_iff ..).mpr ((heq d hd).of_dvd hrp)]
  · simp

private lemma divisorPair {n q : ℕ} (hn : n ≠ 0) (hs : Squarefree n)
    (hq : q.Prime) (hqn : q ∣ n) {K : Type*} [AddCommGroup K] (g : ℕ → K)
    (hg : ∀ d, d ∣ n/q → g (q*d) = -g d) : ∑ d ∈ n.divisors,g d = 0 := by
  classical
  obtain ⟨b,rfl⟩ := hqn
  have hb : b ≠ 0 := by rintro rfl; simp at hn
  rw [Nat.mul_div_cancel_left _ hq.pos] at hg
  have hqb := hq.coprime_iff_not_dvd.mp (Nat.coprime_of_squarefree_mul hs)
  have dec : (q*b).divisors = b.divisors ∪ b.divisors.image (q*·) := by
    ext d
    simp only [mem_union,mem_image,Nat.mem_divisors, hn,hb,ne_eq,not_false_eq_true,and_true]
    constructor
    · intro hd
      by_cases h : q ∣ d
      · obtain ⟨j,rfl⟩ := h
        exact Or.inr ⟨j,(Nat.dvd_of_mul_dvd_mul_left hq.pos hd),rfl⟩
      · exact Or.inl ((hq.coprime_iff_not_dvd.mpr h).symm.dvd_mul_left.mp hd)
    · rintro (h | ⟨j,h,rfl⟩)
      · exact h.trans (dvd_mul_left ..)
      · exact Nat.mul_dvd_mul_left q h
  have dis : Disjoint b.divisors (b.divisors.image (q*·)) := by
    apply disjoint_left.mpr
    rintro d hd hi
    obtain ⟨j,_,rfl⟩ := mem_image.mp hi
    exact hqb ((dvd_mul_right q j).trans (Nat.dvd_of_mem_divisors hd))
  rw [dec,sum_union dis,sum_image (fun _ _ _ _ h => Nat.eq_of_mul_eq_mul_left hq.pos h)]
  rw [sum_congr rfl (fun j hj => hg j (Nat.dvd_of_mem_divisors hj)),sum_neg_distrib,add_neg_cancel]

theorem problem5 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  classical
  letI : Fact p.Prime := ⟨hp⟩
  letI : Fact r.Prime := ⟨hr⟩
  have hrp := hpr.symm.dvd'
  have hr2 : 2 < r := by rw [hf]; have H := Nat.pow_le_pow_right (by decide : 0 < 2) (show 1 ≤ 2^m from Nat.one_le_two_pow); omega
  have hp2 : 2 < p := by have := Nat.le_of_dvd (show 0 < p-1 by have := hp.two_le; omega) hrp; omega
  have hrn (n' : ℕ) (h : Squarefree n') (h' : n' ≠ 0) :
      (n'.divisors.card : ZMod p) ≠ 0 := by
    have hc := Nat.card_divisors h'
    rw [prod_eq_pow_card (b := 2) (fun q hq => by
      rw [Nat.factorization_eq_one_of_squarefree h (Nat.prime_of_mem_primeFactors hq) (Nat.dvd_of_mem_primeFactors hq)] )] at hc
    rw [hc,Nat.cast_pow]
    apply pow_ne_zero
    exact (ZMod.natCast_eq_zero_iff _ _).not.mpr (Nat.not_dvd_of_pos_of_lt (by decide) hp2)
  have ht := testResidues (n := n) hp2 hrp (by
    intro x
    obtain ⟨z,rfl⟩ := ZMod.intCast_surjective x
    have H := (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).mpr ((show (p:ℤ) ∣ n by exact_mod_cast hpn).trans (ha z))
    push_cast at H
    exact sub_eq_zero.mp H)
  have hkn := hrn n hs hn.ne'
  have nr : ¬ r ∣ n := by
    intro h
    let g : ZMod r → ZMod p := fun t => if t=0 then -1 else 1
    have H := divisorPair hn.ne' hs hr h (fun d => g d) (by
      intro d hd
      have H := Nat.coprime_of_squarefree_mul (show Squarefree (r*(n/r)) by rwa [Nat.mul_div_cancel' h])
      have hrd := hr.coprime_iff_not_dvd.mp H
      have h0 : (d : ZMod r) ≠ 0 := (ZMod.natCast_eq_zero_iff ..).not.mpr (fun hh => hrd (hh.trans hd))
      simp [g,h0])
    rw [ht g] at H
    simpa [g,hkn] using H
  have extendP (k : ℕ) (H : ∀ q, q.Prime → q ∣ n → (q : ZMod r)^k = 1) :
      ∀ d, d ∣ n → (d : ZMod r)^k = 1 := by
    intro d hd
    have he := Nat.prod_primeFactors_of_squarefree (hs.squarefree_of_dvd hd)
    conv_lhs => rw [← he]
    push_cast
    rw [← Finset.prod_pow]
    exact prod_eq_one fun q hq => H _ (Nat.prime_of_mem_primeFactors hq) ((Nat.dvd_of_mem_primeFactors hq).trans hd)
  have descend (t : ℕ) (hh : ∀ d, d ∣ n → (d : ZMod r)^(2^t) = 1) : ∀ d, d ∣ n → (d : ZMod r) = 1 := by
    induction t with
    | zero => simpa using hh
    | succ t ih =>
      apply ih
      apply extendP
      intro q hq hqn
      have sign (d) (hd : d ∣ n) : (d : ZMod r)^(2^t) = 1 ∨ (d : ZMod r)^(2^t) = -1 := by
        have H := hh d hd
        rw [pow_succ, pow_mul,sq_eq_one_iff] at H
        exact H
      rcases sign q hqn with h | h
      · exact h
      exfalso
      let g : ZMod r → ZMod p := fun x => if x^(2^t)=1 then 1 else -1
      have hneg : (-1 : ZMod r) ≠ 1 := by
        intro he
        have H : (2 : ZMod r) = 0 := by linear_combination -he
        exact Nat.not_dvd_of_pos_of_lt (by decide) hr2 ((ZMod.natCast_eq_zero_iff 2 r).mp H)
      have H := divisorPair hn.ne' hs hq hqn (fun d => g d) (by
        intro d hd
        rcases sign d (hd.trans (Nat.div_dvd_of_dvd hqn)) with h' | h' <;>
          simp [g,Nat.cast_mul,mul_pow,h,h',hneg])
      rw [ht g] at H
      simpa [g,hkn] using H
  have H := descend (2^m) (by
    intro d hd
    have h0 := (ZMod.natCast_eq_zero_iff d r).not.mpr (fun hh => nr (hh.trans hd))
    simpa [hf] using ZMod.pow_card_sub_one_eq_one h0)
  intro d hd
  apply (ZMod.natCast_eq_natCast_iff ..).mp
  simpa using H _ (Nat.dvd_of_mem_divisors hd)

#print axioms problem5