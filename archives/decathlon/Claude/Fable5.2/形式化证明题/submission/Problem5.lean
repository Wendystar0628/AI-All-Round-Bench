import Mathlib.FieldTheory.Finite.Basic
import Mathlib.GroupTheory.Perm.Cycle.Type
import Mathlib.NumberTheory.ArithmeticFunction.Misc
import Mathlib.Data.Nat.Squarefree
import Mathlib.Data.Nat.Factorization.Induction
import Mathlib.Algebra.Ring.GeomSum

namespace Problem5

lemma stepA (n p r : ℕ) (hr : r.Prime) (hp : p.Prime) (hpn : p ∣ n) (hrp : r ∣ p - 1)
    (hrlt : r < p)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    (e : ℕ) (he : ¬ r ∣ e + 1) :
    p ∣ (n.divisors.filter (fun d => r ∣ d + e)).card := by
  have : Fact p.Prime := ⟨hp⟩
  have : Fact r.Prime := ⟨hr⟩
  -- hypothesis in ZMod p
  have hy : ∀ y : ZMod p, ∑ d ∈ n.divisors, y ^ d = (n.divisors.card : ZMod p) * y := by
    intro y
    have h1 := ha (y.val : ℤ)
    have h2 : ((p : ℤ)) ∣
        (∑ d ∈ n.divisors, (y.val : ℤ) ^ d) - (n.divisors.card : ℤ) * (y.val : ℤ) :=
      dvd_trans (Int.natCast_dvd_natCast.2 hpn) h1
    have h3 := (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).2 h2
    push_cast at h3
    rw [ZMod.natCast_zmod_val] at h3
    exact sub_eq_zero.1 h3
  -- root of unity
  obtain ⟨ζ, hζ⟩ := exists_prime_orderOf_dvd_card (G := (ZMod p)ˣ) r
    (by rw [ZMod.card_units]; exact hrp)
  set z : ZMod p := (ζ : ZMod p) with hz
  have hzpow : ∀ a : ℕ, z ^ a = 1 ↔ r ∣ a := by
    intro a
    rw [← hζ, orderOf_dvd_iff_pow_eq_one, hz, ← Units.val_pow_eq_pow_val, Units.val_eq_one]
  have hgeom : ∀ a : ℕ,
      ∑ i ∈ Finset.range r, (z ^ a) ^ i = if r ∣ a then (r : ZMod p) else 0 := by
    intro a
    split_ifs with h
    · rw [(hzpow a).2 h]; simp
    · have h1 : z ^ a ≠ 1 := fun h' => h ((hzpow a).1 h')
      have h2 := mul_geom_sum (z ^ a) r
      have h3 : (z ^ a) ^ r = 1 := by
        rw [← pow_mul, mul_comm, pow_mul, (hzpow r).2 dvd_rfl, one_pow]
      rw [h3, sub_self] at h2
      exact (mul_eq_zero.1 h2).resolve_left (sub_ne_zero.2 h1)
  have hmain : ∑ d ∈ n.divisors, ∑ i ∈ Finset.range r, (z ^ (d + e)) ^ i
      = (n.divisors.card : ZMod p) * ∑ i ∈ Finset.range r, (z ^ (e + 1)) ^ i := by
    rw [Finset.sum_comm, Finset.mul_sum]
    refine Finset.sum_congr rfl (fun i _ => ?_)
    have := hy (z ^ i)
    calc ∑ d ∈ n.divisors, (z ^ (d + e)) ^ i
        = (z ^ i) ^ e * ∑ d ∈ n.divisors, (z ^ i) ^ d := by
          rw [Finset.mul_sum]
          refine Finset.sum_congr rfl (fun d _ => ?_)
          ring
      _ = _ := by rw [this]; ring
  simp only [hgeom, if_neg he, mul_zero] at hmain
  rw [← Finset.sum_filter, Finset.sum_const, nsmul_eq_mul] at hmain
  have hr0 : (r : ZMod p) ≠ 0 := by
    intro h
    rw [ZMod.natCast_eq_zero_iff] at h
    exact absurd (Nat.le_of_dvd hr.pos h) (not_le.2 hrlt)
  have := (mul_eq_zero.1 hmain).resolve_right hr0
  exact (ZMod.natCast_eq_zero_iff _ _).1 this

lemma stepA' (n p r : ℕ) (hr : r.Prime) (hp : p.Prime) (hpn : p ∣ n) (hrp : r ∣ p - 1)
    (hrlt : r < p)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    (j : ZMod r) (hj : j ≠ 1) :
    p ∣ (n.divisors.filter (fun d : ℕ => (d : ZMod r) = j)).card := by
  have : NeZero r := ⟨hr.ne_zero⟩
  have hiff : ∀ d : ℕ, ((d : ZMod r) = j) ↔ r ∣ d + (-j).val := by
    intro d
    rw [← ZMod.natCast_eq_zero_iff, Nat.cast_add, ZMod.natCast_zmod_val]
    constructor
    · intro h; rw [h]; ring
    · intro h; linear_combination h
  have hne : ¬ r ∣ (-j).val + 1 := by
    rw [← ZMod.natCast_eq_zero_iff, Nat.cast_add, ZMod.natCast_zmod_val, Nat.cast_one]
    intro h
    apply hj
    linear_combination -h
  have h := stepA n p r hr hp hpn hrp hrlt ha ((-j).val) hne
  rw [Finset.filter_congr (fun d _ => hiff d)]
  exact h

lemma stepB (n p r : ℕ) (hr : r.Prime) (hp : p.Prime) (hpn : p ∣ n) (hrp : r ∣ p - 1)
    (hrlt : r < p)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x)
    (P : ZMod r → Prop) [DecidablePred P] (hP1 : ¬ P 1) :
    p ∣ (n.divisors.filter (fun d : ℕ => P (d : ZMod r))).card := by
  have : NeZero r := ⟨hr.ne_zero⟩
  rw [Finset.card_eq_sum_card_fiberwise (f := fun d : ℕ => (d : ZMod r))
    (t := Finset.univ.filter P)
    (fun d hd => by simpa using (Finset.mem_filter.1 (Finset.mem_coe.1 hd)).2)]
  apply Finset.dvd_sum
  intro j hj
  have hPj : P j := (Finset.mem_filter.1 hj).2
  have hj1 : j ≠ 1 := fun h => hP1 (h ▸ hPj)
  have h := stepA' n p r hr hp hpn hrp hrlt ha j hj1
  convert h using 2
  ext d
  simp only [Finset.mem_filter]
  constructor
  · rintro ⟨⟨hd, _⟩, hdj⟩; exact ⟨hd, hdj⟩
  · rintro ⟨hd, hdj⟩; exact ⟨⟨hd, hdj ▸ hPj⟩, hdj⟩

lemma stepC (n q : ℕ) (hn : Squarefree n) (hq : q.Prime) (hqn : q ∣ n)
    (P : ℕ → Prop) [DecidablePred P]
    (hP : ∀ d ∈ n.divisors, ¬ q ∣ d → (P (d * q) ↔ ¬ P d)) :
    n.divisors.card = 2 * (n.divisors.filter P).card := by
  have hn0 : n ≠ 0 := hn.ne_zero
  set σ : ℕ → ℕ := fun d => if q ∣ d then d / q else d * q with hσ
  have hσ1 : ∀ d, q ∣ d → σ d = d / q := fun d h => by simp [hσ, h]
  have hσ2 : ∀ d, ¬ q ∣ d → σ d = d * q := fun d h => by simp [hσ, h]
  have hσmem : ∀ d ∈ n.divisors, σ d ∈ n.divisors := by
    intro d hd
    rw [Nat.mem_divisors] at hd ⊢
    refine ⟨?_, hn0⟩
    by_cases h : q ∣ d
    · rw [hσ1 d h]
      exact dvd_trans (Nat.div_dvd_of_dvd h) hd.1
    · rw [hσ2 d h]
      exact Nat.Coprime.mul_dvd_of_dvd_of_dvd
        ((Nat.Prime.coprime_iff_not_dvd hq).2 h).symm hd.1 hqn
  have hsq : ∀ d ∈ n.divisors, q ∣ d → ¬ q ∣ d / q := by
    intro d hd h h'
    rw [Nat.mem_divisors] at hd
    have h1 : q * q ∣ n := by
      obtain ⟨c, hc⟩ := h'
      have h2 : d = q * (q * c) := by rw [← hc, Nat.mul_div_cancel' h]
      exact dvd_trans ⟨c, by rw [h2]; ring⟩ hd.1
    have h3 := hn q h1
    exact hq.one_lt.ne' (Nat.isUnit_iff.1 h3)
  have hσσ : ∀ d ∈ n.divisors, σ (σ d) = d := by
    intro d hd
    by_cases h : q ∣ d
    · rw [hσ1 d h, hσ2 _ (hsq d hd h), Nat.div_mul_cancel h]
    · rw [hσ2 d h, hσ1 _ (Dvd.intro_left d rfl), Nat.mul_div_cancel _ hq.pos]
  have hσP : ∀ d ∈ n.divisors, (P (σ d) ↔ ¬ P d) := by
    intro d hd
    by_cases h : q ∣ d
    · have h1 : σ d = d / q := hσ1 d h
      have hd' : d / q ∈ n.divisors := h1 ▸ hσmem d hd
      have h2 := hP (d / q) hd' (hsq d hd h)
      rw [Nat.div_mul_cancel h] at h2
      rw [h1]
      tauto
    · rw [hσ2 d h]
      exact hP d hd h
  have hcard : (n.divisors.filter P).card = (n.divisors.filter (fun d => ¬ P d)).card := by
    apply Finset.card_nbij' σ σ
    · intro d hd
      have hd' := Finset.mem_filter.1 (Finset.mem_coe.1 hd)
      exact Finset.mem_coe.2 (Finset.mem_filter.2
        ⟨hσmem d hd'.1, fun h => ((hσP d hd'.1).1 h) hd'.2⟩)
    · intro d hd
      have hd' := Finset.mem_filter.1 (Finset.mem_coe.1 hd)
      exact Finset.mem_coe.2 (Finset.mem_filter.2
        ⟨hσmem d hd'.1, (hσP d hd'.1).2 hd'.2⟩)
    · intro d hd
      exact hσσ d (Finset.mem_filter.1 (Finset.mem_coe.1 hd)).1
    · intro d hd
      exact hσσ d (Finset.mem_filter.1 (Finset.mem_coe.1 hd)).1
  have := Finset.card_filter_add_card_filter_not (s := n.divisors) P
  omega

lemma stepD (n p : ℕ) (hn : Squarefree n) (hp : p.Prime) (hp2 : 2 < p) :
    ¬ p ∣ n.divisors.card := by
  rw [Nat.card_divisors hn.ne_zero]
  have h1 : n.primeFactors.prod (n.factorization · + 1) = 2 ^ n.primeFactors.card := by
    rw [← Finset.prod_const]
    refine Finset.prod_congr rfl (fun x hx => ?_)
    rw [Nat.factorization_eq_one_of_squarefree hn (Nat.prime_of_mem_primeFactors hx)
      (Nat.dvd_of_mem_primeFactors hx)]
  rw [h1]
  intro h
  have := Nat.le_of_dvd (by norm_num) (hp.dvd_of_dvd_pow h)
  omega

lemma pow_eq_one_of_primes (r N : ℕ) (d : ℕ) (hd : d ≠ 0)
    (h : ∀ q : ℕ, q.Prime → q ∣ d → ((q : ZMod r)) ^ N = 1) : ((d : ZMod r)) ^ N = 1 := by
  induction d using Nat.recOnMul with
  | zero => exact absurd rfl hd
  | one => simp
  | prime q hq => exact h q hq dvd_rfl
  | mul a b iha ihb =>
    have ha : a ≠ 0 := fun h0 => hd (by rw [h0, zero_mul])
    have hb : b ≠ 0 := fun h0 => hd (by rw [h0, mul_zero])
    rw [Nat.cast_mul, mul_pow, iha ha (fun q hq hqa => h q hq (hqa.mul_right b)),
      ihb hb (fun q hq hqb => h q hq (hqb.mul_left a)), one_mul]

theorem main (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  have hr3 : 3 ≤ r := by
    have h1 : 1 ≤ 2 ^ m := Nat.one_le_two_pow
    have h2 : 2 ^ 1 ≤ 2 ^ (2 ^ m) := Nat.pow_le_pow_right (by norm_num) h1
    omega
  have hrp : r ∣ p - 1 := (Nat.modEq_iff_dvd' hp.one_lt.le).1 hpr.symm
  have hrlt : r < p := by
    have h1 : 0 < p - 1 := by have := hp.two_le; omega
    have := Nat.le_of_dvd h1 hrp
    omega
  have hp2 : 2 < p := by omega
  have : Fact r.Prime := ⟨hr⟩
  have : Fact (2 < r) := ⟨by omega⟩
  have : NeZero r := ⟨hr.ne_zero⟩
  have hD := stepD n p hs hp hp2
  by_contra hcon
  push Not at hcon
  obtain ⟨d0, hd0, hd0ne⟩ := hcon
  have hn0 : n ≠ 0 := hn.ne'
  by_cases hrn : r ∣ n
  · -- case 1 : r ∣ n
    have h1 := stepC n r hs hr hrn (fun d => ((d : ℕ) : ZMod r) = 0) (by
      intro d hd hrd
      simp only [Nat.cast_mul, ZMod.natCast_self, mul_zero, true_iff]
      rwa [ZMod.natCast_eq_zero_iff])
    have h2 := stepB n p r hr hp hpn hrp hrlt ha (fun j => j = 0) (by simp)
    apply hD
    rw [h1]
    refine Dvd.dvd.mul_left ?_ 2
    convert h2 using 2
  · -- case 2 : r ∤ n
    have hprime_ne : ∀ q ∈ n.primeFactors, ((q : ℕ) : ZMod r) ≠ 0 := by
      intro q hq h0
      rw [ZMod.natCast_eq_zero_iff] at h0
      exact hrn (dvd_trans h0 (Nat.dvd_of_mem_primeFactors hq))
    have hord : ∀ q ∈ n.primeFactors, ∃ s, orderOf ((q : ℕ) : ZMod r) = 2 ^ s := by
      intro q hq
      have h1 : ((q : ℕ) : ZMod r) ^ (r - 1) = 1 :=
        ZMod.pow_card_sub_one_eq_one (hprime_ne q hq)
      have h2 : orderOf ((q : ℕ) : ZMod r) ∣ 2 ^ (2 ^ m) := by
        have h3 := orderOf_dvd_of_pow_eq_one h1
        have hr1 : r - 1 = 2 ^ (2 ^ m) := by omega
        rwa [hr1] at h3
      obtain ⟨s, _, hs'⟩ := (Nat.dvd_prime_pow Nat.prime_two).1 h2
      exact ⟨s, hs'⟩
    have hne : n.primeFactors.Nonempty := ⟨p, Nat.mem_primeFactors.2 ⟨hp, hpn, hn0⟩⟩
    obtain ⟨q, hq, hqmax⟩ := Finset.exists_max_image n.primeFactors
      (fun q => orderOf ((q : ℕ) : ZMod r)) hne
    obtain ⟨s, hso⟩ := hord q hq
    have hall : ∀ q' ∈ n.primeFactors, ((q' : ℕ) : ZMod r) ^ (2 ^ s) = 1 := by
      intro q' hq'
      obtain ⟨s', hs'⟩ := hord q' hq'
      have hle := hqmax q' hq'
      simp only [hs', hso] at hle
      have hss : s' ≤ s := (Nat.pow_le_pow_iff_right (by norm_num)).1 hle
      apply orderOf_dvd_iff_pow_eq_one.1
      rw [hs']
      exact pow_dvd_pow 2 hss
    have hdiv : ∀ d ∈ n.divisors, ((d : ℕ) : ZMod r) ^ (2 ^ s) = 1 := by
      intro d hd
      have hd' := Nat.mem_divisors.1 hd
      apply pow_eq_one_of_primes r (2 ^ s) d
        (fun h0 => by rw [h0] at hd'; exact hn0 (zero_dvd_iff.1 hd'.1))
      intro q' hq' hq'd
      exact hall q' (Nat.mem_primeFactors.2 ⟨hq', dvd_trans hq'd hd'.1, hn0⟩)
    rcases Nat.eq_zero_or_pos s with hs0 | hspos
    · -- s = 0
      have h1 := hdiv d0 hd0
      rw [hs0, pow_zero, pow_one] at h1
      apply hd0ne
      rw [← ZMod.natCast_eq_natCast_iff, h1, Nat.cast_one]
    · obtain ⟨s1, rfl⟩ : ∃ s1, s = s1 + 1 := ⟨s - 1, by omega⟩
      set E := 2 ^ s1 with hE
      have hEpos : 0 < E := by positivity
      have h2E : 2 ^ (s1 + 1) = E + E := by rw [pow_succ]; omega
      have hqE : ((q : ℕ) : ZMod r) ^ E = -1 := by
        have h1 : ((q : ℕ) : ZMod r) ^ E ≠ 1 := by
          apply pow_ne_one_of_lt_orderOf hEpos.ne'
          rw [hso, h2E]; omega
        have h2 : ((q : ℕ) : ZMod r) ^ E * ((q : ℕ) : ZMod r) ^ E = 1 := by
          rw [← pow_add, ← h2E]; exact hall q hq
        rcases mul_self_eq_one_iff.1 h2 with h | h
        · exact absurd h h1
        · exact h
      have h1 := stepC n q hs (Nat.prime_of_mem_primeFactors hq)
        (Nat.dvd_of_mem_primeFactors hq) (fun d => ((d : ℕ) : ZMod r) ^ E ≠ 1) (by
        intro d hd hqd
        simp only [Nat.cast_mul, mul_pow, hqE]
        have h3 : ((d : ℕ) : ZMod r) ^ E * ((d : ℕ) : ZMod r) ^ E = 1 := by
          rw [← pow_add, ← h2E]; exact hdiv d hd
        rcases mul_self_eq_one_iff.1 h3 with h | h
        · rw [h]; simp [ZMod.neg_one_ne_one]
        · rw [h]; simp [ZMod.neg_one_ne_one])
      have h2 := stepB n p r hr hp hpn hrp hrlt ha (fun j => j ^ E ≠ 1) (by simp)
      apply hD
      rw [h1]
      refine Dvd.dvd.mul_left ?_ 2
      convert h2 using 2

end Problem5

theorem problem5 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := 
  Problem5.main n p r m hn hs hr hf hp hpn hpr ha

#print axioms problem5
