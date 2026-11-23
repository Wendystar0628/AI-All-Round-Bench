import Mathlib

open Polynomial

lemma p7_split {M : Type*} [AddCommMonoid M] (q m' : ℕ) (hq : q.Prime) (hcop : ¬ q ∣ m')
    (hm : m' ≠ 0) (F : ℕ → M) :
    ∑ d ∈ (q * m').divisors, F d = ∑ d ∈ m'.divisors, F d + ∑ d ∈ m'.divisors, F (q * d) := by
  have hdisj : Disjoint m'.divisors (m'.divisors.image (q * ·)) := by
    rw [Finset.disjoint_left]
    intro d hd hd'
    obtain ⟨e, he, rfl⟩ := Finset.mem_image.mp hd'
    exact hcop (dvd_trans (dvd_mul_right q e) (Nat.dvd_of_mem_divisors hd))
  have hunion : (q * m').divisors = m'.divisors ∪ m'.divisors.image (q * ·) := by
    ext d
    simp only [Finset.mem_union, Finset.mem_image, Nat.mem_divisors]
    constructor
    · rintro ⟨hd, -⟩
      by_cases hqd : q ∣ d
      · obtain ⟨e, rfl⟩ := hqd
        right
        refine ⟨e, ⟨?_, hm⟩, rfl⟩
        exact Nat.dvd_of_mul_dvd_mul_left hq.pos hd
      · left
        refine ⟨?_, hm⟩
        have : Nat.Coprime d q := Nat.coprime_comm.mp ((Nat.Prime.coprime_iff_not_dvd hq).mpr hqd)
        exact this.dvd_of_dvd_mul_left hd
    · rintro (⟨hd, -⟩ | ⟨e, ⟨he, -⟩, rfl⟩)
      · exact ⟨dvd_mul_of_dvd_right hd q, mul_ne_zero hq.ne_zero hm⟩
      · exact ⟨mul_dvd_mul_left q he, mul_ne_zero hq.ne_zero hm⟩
  rw [hunion, Finset.sum_union hdisj, Finset.sum_image]
  intro a _ b _ h
  exact Nat.eq_of_mul_eq_mul_left hq.pos h

lemma p7_sum_group {K : Type*} [CommRing K] (r : ℕ) [NeZero r] (S : Finset ℕ) (y : K)
    (hy : y ^ r = 1) :
    ∑ j : ZMod r, (∑ d ∈ S, if (d : ZMod r) = j then (1:K) else 0) * y ^ j.val
      = ∑ d ∈ S, y ^ d := by
  simp_rw [Finset.sum_mul]
  rw [Finset.sum_comm]
  refine Finset.sum_congr rfl fun d _ => ?_
  have h1 : ∀ j : ZMod r, ((if (d : ZMod r) = j then (1:K) else 0) * y ^ j.val)
      = if (d : ZMod r) = j then y ^ j.val else 0 := by
    intro j
    split_ifs <;> simp
  simp_rw [h1]
  rw [Finset.sum_ite_eq]
  simp only [Finset.mem_univ, ite_true]
  rw [ZMod.val_natCast]
  conv_rhs => rw [← Nat.div_add_mod d r, pow_add, pow_mul, hy, one_pow, one_mul]

lemma p7_dft (n p r : ℕ) [Fact p.Prime] [Fact r.Prime] (hr : 2 < r) (hrp : r ∣ p - 1)
    (hpoly : ∀ x : ZMod p, ∑ d ∈ n.divisors, x ^ d = (n.divisors.card : ZMod p) * x)
    (j : ZMod r) :
    ∑ d ∈ n.divisors, (if (d : ZMod r) = j then (1 : ZMod p) else 0)
       = if j = 1 then (n.divisors.card : ZMod p) else 0 := by
  haveI : NeZero r := ⟨(Fact.out : r.Prime).ne_zero⟩
  haveI : Fact (1 < r) := ⟨by omega⟩
  have hdvd : r ∣ Fintype.card (ZMod p)ˣ := by rw [ZMod.card_units p]; exact hrp
  obtain ⟨u, hu⟩ := exists_prime_orderOf_dvd_card r hdvd
  set ζ : ZMod p := (u : ZMod p) with hζ
  have hord : orderOf ζ = r := by rw [hζ, orderOf_units]; exact hu
  have hζr : ζ ^ r = 1 := by rw [← hord]; exact pow_orderOf_eq_one ζ
  set N : ZMod r → ZMod p := fun j => ∑ d ∈ n.divisors, (if (d : ZMod r) = j then (1 : ZMod p) else 0)
    with hN
  set Q : (ZMod p)[X] := ∑ j : ZMod r, C (N j) * X ^ j.val
    - C (n.divisors.card : ZMod p) * X with hQ
  have hdeg : Q.natDegree < Fintype.card (Fin r) := by
    rw [Fintype.card_fin]
    have h1 : (∑ j : ZMod r, C (N j) * X ^ j.val : (ZMod p)[X]).natDegree ≤ r - 1 := by
      apply natDegree_sum_le_of_forall_le
      intro j _
      refine (natDegree_C_mul_X_pow_le _ _).trans ?_
      have := ZMod.val_lt j
      omega
    have h2 : (C (n.divisors.card : ZMod p) * X : (ZMod p)[X]).natDegree ≤ r - 1 := by
      refine ((natDegree_C_mul_le _ _).trans natDegree_X_le).trans ?_
      omega
    have h3 : Q.natDegree ≤ max (∑ j : ZMod r, C (N j) * X ^ j.val : (ZMod p)[X]).natDegree
        (C (n.divisors.card : ZMod p) * X).natDegree := by
      rw [hQ]; exact natDegree_sub_le _ _
    omega
  have hQ0 : Q = 0 := by
    apply eq_zero_of_natDegree_lt_card_of_eval_eq_zero Q (f := fun i : Fin r => ζ ^ (i : ℕ)) _ _ hdeg
    · intro a b hab
      apply Fin.ext
      exact pow_injOn_Iio_orderOf (by simpa [hord] using a.2) (by simpa [hord] using b.2) hab
    · intro i
      have hy : (ζ ^ (i:ℕ)) ^ r = 1 := by rw [← pow_mul, mul_comm, pow_mul, hζr, one_pow]
      simp only [hQ, eval_sub, eval_finset_sum, eval_mul, eval_C, eval_pow, eval_X]
      rw [p7_sum_group r n.divisors _ hy, hpoly]
      ring
  have hcoef := congrArg (fun P => P.coeff j.val) hQ0
  simp only [hQ, coeff_sub, finset_sum_coeff, coeff_C_mul_X_pow, coeff_C_mul_X, coeff_zero]
    at hcoef
  have h1 : ∑ j' : ZMod r, (if j.val = j'.val then N j' else 0) = N j := by
    rw [Finset.sum_eq_single j]
    · simp
    · intro j' _ hne
      rw [if_neg]
      intro h
      exact hne ((ZMod.val_injective r h).symm)
    · simp
  have h2 : (j.val = 1) ↔ (j = 1) := by
    constructor
    · intro h
      apply ZMod.val_injective r
      rw [h, ZMod.val_one]
    · rintro rfl
      exact ZMod.val_one r
  rw [h1] at hcoef
  by_cases hj : j = 1
  · have : j.val = 1 := h2.mpr hj
    rw [if_pos this] at hcoef
    rw [if_pos hj]
    exact sub_eq_zero.mp hcoef
  · have : ¬ j.val = 1 := fun h => hj (h2.mp h)
    rw [if_neg this, sub_zero] at hcoef
    rw [if_neg hj]
    exact hcoef

lemma p7_cycle {K : Type*} [CommRing K] (o : ℕ) (ho : Even o) (ho0 : 0 < o) (u : ℕ → K) (k : K)
    (hu : ∀ i, u i + u (i+1) = if o ∣ i then k else 0) (hper : u o = u 0) : k = 0 := by
  have htel : ∀ t, ∑ i ∈ Finset.range t, (-1 : K) ^ i * (u i + u (i+1))
      = u 0 - (-1) ^ t * u t := by
    intro t
    induction t with
    | zero => simp
    | succ t ih => rw [Finset.sum_range_succ, ih]; ring
  have h1 := htel o
  rw [ho.neg_one_pow, one_mul, hper, sub_self] at h1
  have h2 : ∑ i ∈ Finset.range o, (-1 : K) ^ i * (u i + u (i+1)) = k := by
    rw [Finset.sum_eq_single 0]
    · simpa using hu 0
    · intro i hi hne
      rw [hu i, if_neg, mul_zero]
      intro hdvd
      have := Nat.le_of_dvd (Nat.pos_of_ne_zero hne) hdvd
      have := Finset.mem_range.mp hi
      omega
    · intro h
      exact absurd (Finset.mem_range.mpr ho0) h
  rw [h2] at h1
  exact h1

lemma p7_prime_case (p r m q m' : ℕ) [Fact p.Prime] [Fact r.Prime] (hr : r = 2 ^ (2 ^ m) + 1)
    (hq : q.Prime) (hcop : ¬ q ∣ m') (hm' : m' ≠ 0)
    (hN : ∀ j : ZMod r, ∑ d ∈ (q * m').divisors, (if (d : ZMod r) = j then (1 : ZMod p) else 0)
       = if j = 1 then (((q * m').divisors.card : ℕ) : ZMod p) else 0)
    (hk : (((q * m').divisors.card : ℕ) : ZMod p) ≠ 0) :
    (q : ZMod r) = 1 := by
  by_contra ha1
  haveI : Fact (1 < r) := ⟨(Fact.out : r.Prime).one_lt⟩
  by_cases hqr : q = r
  · have hq0 : (q : ZMod r) = 0 := by rw [hqr]; exact ZMod.natCast_self r
    have h0 := hN 0
    rw [p7_split q m' hq hcop hm' (fun d => if (d : ZMod r) = 0 then (1 : ZMod p) else 0)] at h0
    have hs1 : ∑ d ∈ m'.divisors, (if (d : ZMod r) = 0 then (1 : ZMod p) else 0) = 0 := by
      apply Finset.sum_eq_zero
      intro d hd
      rw [if_neg]
      intro h
      rw [ZMod.natCast_eq_zero_iff] at h
      apply hcop
      rw [hqr]
      exact h.trans (Nat.dvd_of_mem_divisors hd)
    have hs2 : ∑ d ∈ m'.divisors, (if ((q * d : ℕ) : ZMod r) = 0 then (1 : ZMod p) else 0)
        = (m'.divisors.card : ZMod p) := by
      have : ∀ d ∈ m'.divisors, (if ((q * d : ℕ) : ZMod r) = 0 then (1 : ZMod p) else 0) = 1 := by
        intro d _
        rw [if_pos]
        rw [Nat.cast_mul, hq0, zero_mul]
      rw [Finset.sum_congr rfl this]
      simp
    rw [hs1, hs2, zero_add, if_neg zero_ne_one] at h0
    have hk2 := p7_split q m' hq hcop hm' (fun _ => (1 : ZMod p))
    simp only [Finset.sum_const, nsmul_eq_mul, mul_one] at hk2
    apply hk
    rw [hk2, h0]
    ring
  · have ha0 : (q : ZMod r) ≠ 0 := by
      intro h
      rw [ZMod.natCast_eq_zero_iff] at h
      exact hqr ((Nat.prime_dvd_prime_iff_eq (Fact.out : r.Prime) hq).mp h).symm
    obtain ⟨b, hab⟩ : ∃ b : ZMod r, (q : ZMod r) * b = 1 := ⟨(q : ZMod r)⁻¹, mul_inv_cancel₀ ha0⟩
    have hb0 : b ≠ 0 := by
      rintro rfl
      simp at hab
    have hb1 : b ≠ 1 := by
      rintro rfl
      apply ha1
      simpa using hab
    set N' : ZMod r → ZMod p := fun j => ∑ d ∈ m'.divisors, if (d : ZMod r) = j then (1 : ZMod p) else 0
      with hN'
    have hsplit : ∀ j : ZMod r, (∑ d ∈ (q * m').divisors, if (d : ZMod r) = j then (1 : ZMod p) else 0)
        = N' j + N' (j * b) := by
      intro j
      rw [p7_split q m' hq hcop hm' (fun d => if (d : ZMod r) = j then (1 : ZMod p) else 0)]
      congr 1
      refine Finset.sum_congr rfl fun d _ => ?_
      have key : ((q * d : ℕ) : ZMod r) = j ↔ (d : ZMod r) = j * b := by
        rw [Nat.cast_mul]
        constructor
        · intro h
          calc (d : ZMod r) = (d : ZMod r) * ((q : ZMod r) * b) := by rw [hab, mul_one]
            _ = ((q : ZMod r) * d) * b := by ring
            _ = j * b := by rw [h]
        · intro h
          rw [h]
          calc (q : ZMod r) * (j * b) = j * ((q : ZMod r) * b) := by ring
            _ = j := by rw [hab, mul_one]
      exact if_congr key rfl rfl
    have hu : ∀ i, N' (b ^ i) + N' (b ^ (i+1))
        = if orderOf b ∣ i then (((q * m').divisors.card : ℕ) : ZMod p) else 0 := by
      intro i
      have h1 := hN (b ^ i)
      rw [hsplit (b ^ i)] at h1
      rw [pow_succ, h1]
      exact if_congr orderOf_dvd_iff_pow_eq_one.symm rfl rfl
    have hper : N' (b ^ orderOf b) = N' (b ^ 0) := by
      rw [pow_orderOf_eq_one, pow_zero]
    have hodvd : orderOf b ∣ r - 1 := orderOf_dvd_of_pow_eq_one (ZMod.pow_card_sub_one_eq_one hb0)
    have hr1 : r - 1 = 2 ^ (2 ^ m) := by rw [hr]; exact Nat.add_sub_cancel _ _
    rw [hr1] at hodvd
    obtain ⟨e, -, he⟩ := (Nat.dvd_prime_pow Nat.prime_two).mp hodvd
    have he0 : e ≠ 0 := by
      rintro rfl
      apply hb1
      exact orderOf_eq_one_iff.mp (by simpa using he)
    have heven : Even (orderOf b) := by
      rw [he]
      exact (Nat.even_pow.mpr ⟨even_two, he0⟩)
    have hpos : 0 < orderOf b := by rw [he]; positivity
    exact hk (p7_cycle (orderOf b) heven hpos (fun i => N' (b ^ i)) _ hu hper)

lemma p7_card_pow2 (n : ℕ) (hn : n ≠ 0) (hs : Squarefree n) : ∃ c, n.divisors.card = 2 ^ c := by
  refine ⟨n.primeFactors.card, ?_⟩
  rw [Nat.card_divisors hn]
  rw [Finset.prod_congr rfl (g := fun _ => 2)]
  · simp
  · intro x hx
    have h1 : n.factorization x ≤ 1 := hs.natFactorization_le_one x
    have hxp : x.Prime := Nat.prime_of_mem_primeFactors hx
    have h2 : 0 < n.factorization x :=
      hxp.factorization_pos_of_dvd hn (Nat.dvd_of_mem_primeFactors hx)
    omega

theorem problem7 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  haveI : Fact p.Prime := ⟨hp⟩
  haveI : Fact r.Prime := ⟨hr⟩
  have hr3 : 2 < r := by
    have h1 : 2 ≤ 2 ^ (2 ^ m) := by
      calc 2 = 2 ^ 1 := by norm_num
        _ ≤ 2 ^ (2 ^ m) := Nat.pow_le_pow_right (by norm_num) Nat.one_le_two_pow
    omega
  have hrp : r ∣ p - 1 := (Nat.modEq_iff_dvd' hp.one_le).mp hpr.symm
  have hp2 : p ≠ 2 := by
    rintro rfl
    have : r ∣ 1 := by simpa using hrp
    have := Nat.le_of_dvd one_pos this
    omega
  have hpoly : ∀ x : ZMod p, ∑ d ∈ n.divisors, x ^ d = (n.divisors.card : ZMod p) * x := by
    intro y
    obtain ⟨x, rfl⟩ := ZMod.intCast_surjective y
    have h1 := ha x
    have h2 : (p : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x :=
      (Int.natCast_dvd_natCast.mpr hpn).trans h1
    have h3 := (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).mpr h2
    push_cast at h3
    exact sub_eq_zero.mp h3
  have hN := p7_dft n p r hr3 hrp hpoly
  have hk : ((n.divisors.card : ℕ) : ZMod p) ≠ 0 := by
    obtain ⟨c, hc⟩ := p7_card_pow2 n hn.ne' hs
    rw [hc]
    intro h
    rw [ZMod.natCast_eq_zero_iff] at h
    have := (Nat.prime_dvd_prime_iff_eq hp Nat.prime_two).mp (hp.dvd_of_dvd_pow h)
    exact hp2 this
  have hprime : ∀ q, q.Prime → q ∣ n → q ≡ 1 [MOD r] := by
    intro q hq hqn
    obtain ⟨m', hm'⟩ := hqn
    have hm'0 : m' ≠ 0 := by
      rintro rfl
      simp at hm'
      omega
    have hcop : ¬ q ∣ m' := by
      have := (Nat.squarefree_mul_iff.mp (hm' ▸ hs)).1
      exact (Nat.Prime.coprime_iff_not_dvd hq).mp this
    subst hm'
    have := p7_prime_case p r m q m' hf hq hcop hm'0 hN hk
    rw [← ZMod.natCast_eq_natCast_iff]
    simpa using this
  have hall : ∀ d, d ∣ n → d ≡ 1 [MOD r] := by
    intro d
    induction d using Nat.strong_induction_on with
    | _ d ih =>
      intro hdn
      by_cases hd1 : d = 1
      · subst hd1
        exact Nat.ModEq.refl 1
      · have hd0 : d ≠ 0 := by
          rintro rfl
          rw [zero_dvd_iff] at hdn
          omega
        obtain ⟨q, hq, hqd⟩ := Nat.exists_prime_and_dvd hd1
        obtain ⟨e, he⟩ := hqd
        have hqn : q ∣ n := (Dvd.intro _ he.symm).trans hdn
        have hen : e ∣ n := (Dvd.intro_left _ he.symm).trans hdn
        have he0 : e ≠ 0 := by
          rintro rfl
          simp at he
          exact hd0 he
        have hlt : e < d := by
          have := hq.two_le
          rw [he]
          nlinarith [Nat.pos_of_ne_zero he0]
        have := (hprime q hq hqn).mul (ih e hlt hen)
        rw [he]
        simpa using this
  intro d hd
  exact hall d (Nat.dvd_of_mem_divisors hd)
