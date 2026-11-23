import Mathlib.Data.ZMod.Basic
import Mathlib.Data.Nat.Squarefree
import Mathlib.Data.Nat.Factorization.Basic
import Mathlib.Algebra.Polynomial.RingDivision
import Mathlib.Algebra.Polynomial.BigOperators
import Mathlib.Algebra.BigOperators.Ring.Finset
import Mathlib.FieldTheory.Finite.Basic
import Mathlib.GroupTheory.OrderOfElement

open Finset Polynomial

namespace Problem5Aux

lemma exists_two_pow_mul_odd :
    ∀ L e : ℕ, ¬ (2 ^ L ∣ e) → ∃ v k, v < L ∧ e = 2 ^ v * (2 * k + 1)
  | 0, _, h => by simp at h
  | L + 1, e, h => by
    by_cases he : e % 2 = 1
    · exact ⟨0, e / 2, Nat.succ_pos L, by omega⟩
    · have h2 : 2 ∣ e := Nat.dvd_of_mod_eq_zero (by omega)
      obtain ⟨e', rfl⟩ := h2
      have h' : ¬ (2 ^ L ∣ e') := fun hd => h (by rw [pow_succ']; exact mul_dvd_mul_left 2 hd)
      obtain ⟨v, k, hv, rfl⟩ := exists_two_pow_mul_odd L e' h'
      exact ⟨v + 1, k, by omega, by rw [pow_succ']; ring⟩

lemma add_one_dvd_pow_odd_add_one {R : Type*} [CommRing R] (Y : R) :
    ∀ k : ℕ, (Y + 1) ∣ (Y ^ (2 * k + 1) + 1)
  | 0 => by simp
  | k + 1 => by
    have ih := add_one_dvd_pow_odd_add_one Y k
    have h1 : Y ^ (2 * (k + 1) + 1) + 1 =
        Y ^ 2 * (Y ^ (2 * k + 1) + 1) - (Y + 1) * (Y - 1) := by ring
    rw [h1]
    exact dvd_sub (dvd_mul_of_dvd_right ih _) (dvd_mul_right _ _)

lemma sub_one_dvd_pow_sub_one' {R : Type*} [CommRing R] (A : R) :
    ∀ k : ℕ, (A - 1) ∣ (A ^ k - 1)
  | 0 => by simp
  | k + 1 => by
    have ih := sub_one_dvd_pow_sub_one' A k
    have h1 : A ^ (k + 1) - 1 = A * (A ^ k - 1) + (A - 1) := by ring
    rw [h1]
    exact dvd_add (dvd_mul_of_dvd_right ih _) (dvd_refl _)

lemma divisors_eq_powerset_image {n : ℕ} (hn : 0 < n) (hs : Squarefree n) :
    n.divisors = n.primeFactors.powerset.image (fun S => ∏ q ∈ S, q) ∧
    Set.InjOn (fun S : Finset ℕ => ∏ q ∈ S, q) (n.primeFactors.powerset : Set (Finset ℕ)) := by
  have hprod_n : ∏ q ∈ n.primeFactors, q = n := Nat.prod_primeFactors_of_squarefree hs
  constructor
  · ext d
    simp only [Nat.mem_divisors, mem_image, mem_powerset]
    constructor
    · rintro ⟨hdn, _⟩
      have hd0 : d ≠ 0 := ne_zero_of_dvd_ne_zero hn.ne' hdn
      have hdsq : Squarefree d := hs.squarefree_of_dvd hdn
      refine ⟨d.primeFactors, Nat.primeFactors_mono hdn hn.ne', Nat.prod_primeFactors_of_squarefree hdsq⟩
    · rintro ⟨S, hS, rfl⟩
      refine ⟨?_, hn.ne'⟩
      rw [← hprod_n]
      exact Finset.prod_dvd_prod_of_subset S n.primeFactors _ hS
  · intro S1 hS1 S2 hS2 heq
    dsimp only at heq
    have hsub : ∀ A B : Finset ℕ, A ⊆ n.primeFactors → B ⊆ n.primeFactors →
        (∏ q ∈ A, q) = (∏ q ∈ B, q) → A ⊆ B := by
      intro A B hA hB hAB q hqA
      have hq_prime : q.Prime := Nat.prime_of_mem_primeFactors (hA hqA)
      have hqdvd : q ∣ ∏ x ∈ B, x := hAB ▸ Finset.dvd_prod_of_mem _ hqA
      rcases (hq_prime.prime.dvd_finsetProd_iff _).mp hqdvd with ⟨x, hxB, hqx⟩
      have hx_prime : x.Prime := Nat.prime_of_mem_primeFactors (hB hxB)
      have hqeq : q = x := (Nat.prime_dvd_prime_iff_eq hq_prime hx_prime).mp hqx
      exact hqeq ▸ hxB
    have hS1' : S1 ⊆ n.primeFactors := mem_powerset.mp (mem_coe.mp hS1)
    have hS2' : S2 ⊆ n.primeFactors := mem_powerset.mp (mem_coe.mp hS2)
    exact Subset.antisymm (hsub S1 S2 hS1' hS2' heq) (hsub S2 S1 hS2' hS1' heq.symm)

lemma card_divisors_of_squarefree {n : ℕ} (hn : 0 < n) (hs : Squarefree n) :
    n.divisors.card = 2 ^ n.primeFactors.card := by
  obtain ⟨heq, hinj⟩ := divisors_eq_powerset_image hn hs
  rw [heq, Finset.card_image_of_injOn hinj, Finset.card_powerset]

lemma exists_generator_zmod_units (q : ℕ) [Fact q.Prime] :
    ∃ g : (ZMod q)ˣ, orderOf g = q - 1 ∧ ∀ x : (ZMod q)ˣ, ∃ k : ℕ, g ^ k = x := by
  have hq : q.Prime := Fact.out
  obtain ⟨g, hg⟩ := IsCyclic.exists_generator (α := (ZMod q)ˣ)
  have hcard : Nat.card (ZMod q)ˣ = q - 1 := by
    rw [Nat.card_eq_fintype_card, ZMod.card_units_eq_totient, Nat.totient_prime hq]
  have hord : orderOf g = q - 1 := by
    rw [orderOf_eq_card_of_forall_mem_zpowers hg, hcard]
  refine ⟨g, hord, fun x => ?_⟩
  have hx : x ∈ Subgroup.zpowers g := hg x
  rw [Subgroup.mem_zpowers_iff] at hx
  obtain ⟨k, rfl⟩ := hx
  have hord_pos : 0 < orderOf g := orderOf_pos g
  have hmod_nonneg : 0 ≤ k % (orderOf g : ℤ) := Int.emod_nonneg k (by omega)
  refine ⟨(k % (orderOf g : ℤ)).toNat, ?_⟩
  have h1 : g ^ ((k % (orderOf g : ℤ)).toNat : ℤ) = g ^ (k % (orderOf g : ℤ)) := by
    rw [Int.toNat_of_nonneg hmod_nonneg]
  rw [← zpow_natCast, h1, zpow_mod_orderOf]

end Problem5Aux

open Problem5Aux

theorem problem5 (n p r m : ℕ) (hn : 0 < n) (hs : Squarefree n)
    (hr : r.Prime) (hf : r = 2 ^ (2 ^ m) + 1)
    (hp : p.Prime) (hpn : p ∣ n) (hpr : Nat.ModEq r p 1)
    (ha : ∀ x : ℤ, (n : ℤ) ∣ (∑ d ∈ n.divisors, x ^ d) - (n.divisors.card : ℤ) * x) :
    ∀ d ∈ n.divisors, Nat.ModEq r d 1 := by
  classical
  have : Fact r.Prime := ⟨hr⟩
  have : Fact p.Prime := ⟨hp⟩
  have h2m_pos : 1 ≤ 2 ^ m := Nat.one_le_two_pow
  have h22m_ge2 : 2 ≤ 2 ^ (2 ^ m) := by
    calc 2 = 2 ^ 1 := by norm_num
      _ ≤ 2 ^ (2 ^ m) := Nat.pow_le_pow_right (by norm_num) h2m_pos
  have hr3 : 3 ≤ r := by omega
  have hr_sub : r - 1 = 2 ^ (2 ^ m) := by omega
  have hr_dvd_p1 : r ∣ (p - 1) := by
    have hp1 : 1 ≤ p := hp.one_lt.le
    exact (Nat.modEq_iff_dvd' hp1).mp hpr.symm
  have hp_ge4 : 4 ≤ p := by
    have hpos : 0 < p - 1 := Nat.sub_pos_of_lt hp.one_lt
    have hle : r ≤ p - 1 := Nat.le_of_dvd hpos hr_dvd_p1
    omega
  have h2_ne_p : (2 : ZMod p) ≠ 0 := by
    intro h0
    have hdvd : p ∣ 2 := (ZMod.natCast_eq_zero_iff 2 p).mp (by simpa using h0)
    have := Nat.le_of_dvd (by norm_num) hdvd
    omega
  have hr_ne_p : (r : ZMod p) ≠ 0 := by
    intro h0
    have hdvd : p ∣ r := (ZMod.natCast_eq_zero_iff r p).mp h0
    have hle : r ≤ p - 1 := Nat.le_of_dvd (by omega) hr_dvd_p1
    have hle2 : p ≤ r := Nat.le_of_dvd (by omega) hdvd
    omega
  -- Reduce ha modulo p
  have ha_modp : ∀ x : ZMod p, ∑ d ∈ n.divisors, x ^ d = (n.divisors.card : ZMod p) * x := by
    intro x
    have hdiv_n := ha (x.val : ℤ)
    have hdiv_p : (p : ℤ) ∣ (∑ d ∈ n.divisors, (x.val : ℤ) ^ d) - (n.divisors.card : ℤ) * (x.val : ℤ) :=
      dvd_trans (Int.natCast_dvd_natCast.mpr hpn) hdiv_n
    have hcast : (((∑ d ∈ n.divisors, (x.val : ℤ) ^ d) - (n.divisors.card : ℤ) * (x.val : ℤ) : ℤ) : ZMod p) = 0 :=
      (ZMod.intCast_zmod_eq_zero_iff_dvd _ p).mpr hdiv_p
    push_cast at hcast
    simp only [ZMod.natCast_zmod_val] at hcast
    exact sub_eq_zero.mp hcast
  -- Construct ζ ∈ (ZMod p)ˣ of exact order r
  obtain ⟨gp, hgp_ord, _⟩ := exists_generator_zmod_units p
  set ζu : (ZMod p)ˣ := gp ^ ((p - 1) / r)
  have hζu_ord : orderOf ζu = r := by
    rw [orderOf_pow, hgp_ord]
    have hdvd_q : (p - 1) / r ∣ p - 1 := Nat.div_dvd_of_dvd hr_dvd_p1
    rw [Nat.gcd_eq_right hdvd_q, Nat.div_div_self hr_dvd_p1 (by omega)]
  set ζ : ZMod p := (ζu : ZMod p)
  have hζ_pow_eq_one : ∀ t : ℕ, ζ ^ t = 1 ↔ r ∣ t := by
    intro t
    have h1 : ζ ^ t = 1 ↔ ζu ^ t = 1 := by
      dsimp [ζ]
      rw [← Units.val_pow_eq_pow_val, ← Units.val_one, Units.ext_iff]
    rw [h1, ← orderOf_dvd_iff_pow_eq_one, hζu_ord]
  have hζ_r : ζ ^ r = 1 := (hζ_pow_eq_one r).mpr (dvd_refl r)
  -- Geometric sum for ζ
  have hgeom : ∀ t : ℕ, ∑ k ∈ range r, ζ ^ (k * t) = if r ∣ t then (r : ZMod p) else 0 := by
    intro t
    split_ifs with hrt
    · have h1 : ζ ^ t = 1 := (hζ_pow_eq_one t).mpr hrt
      have hcongr : ∑ k ∈ range r, ζ ^ (k * t) = ∑ _ ∈ range r, (1 : ZMod p) := by
        refine Finset.sum_congr rfl fun k _ => ?_
        rw [mul_comm, pow_mul, h1, one_pow]
      rw [hcongr]
      simp
    · set w : ZMod p := ζ ^ t
      have hw1 : w ≠ 1 := mt (hζ_pow_eq_one t).mp hrt
      have hwr : w ^ r = 1 := by dsimp [w]; rw [← pow_mul, mul_comm, pow_mul, hζ_r, one_pow]
      have hsum : (w - 1) * ∑ k ∈ range r, w ^ k = 0 := by
        have h := geom_sum_mul w r
        rw [hwr, sub_self] at h
        rw [mul_comm, h]
      have hcongr : ∑ k ∈ range r, ζ ^ (k * t) = ∑ k ∈ range r, w ^ k := by
        refine Finset.sum_congr rfl fun k _ => ?_
        dsimp [w]; rw [mul_comm, pow_mul]
      rw [hcongr]
      exact (mul_eq_zero.mp hsum).resolve_left (sub_ne_zero.mpr hw1)
  -- Fourier inversion: count divisors ≡ j (mod r)
  let c : ℕ → ℕ := fun j => (n.divisors.filter (fun d => d % r = j)).card
  have hc_modp : ∀ j < r, (c j : ZMod p) = if j = 1 then (n.divisors.card : ZMod p) else 0 := by
    intro j hj
    have hzero : ∑ k ∈ range r, ζ ^ (k * (r - j)) *
        ((∑ d ∈ n.divisors, (ζ ^ k) ^ d) - (n.divisors.card : ZMod p) * ζ ^ k) = 0 := by
      apply Finset.sum_eq_zero
      intro k _
      rw [ha_modp (ζ ^ k), sub_self, mul_zero]
    have hexpand : ∑ k ∈ range r, ζ ^ (k * (r - j)) *
        ((∑ d ∈ n.divisors, (ζ ^ k) ^ d) - (n.divisors.card : ZMod p) * ζ ^ k) =
        (∑ d ∈ n.divisors, ∑ k ∈ range r, ζ ^ (k * (d + (r - j)))) -
        (n.divisors.card : ZMod p) * ∑ k ∈ range r, ζ ^ (k * (1 + (r - j))) := by
      simp_rw [mul_sub, Finset.sum_sub_distrib, Finset.mul_sum]
      congr 1
      · rw [Finset.sum_comm]
        refine Finset.sum_congr rfl fun d _ => Finset.sum_congr rfl fun k _ => ?_
        rw [← pow_mul, ← pow_add, mul_add, add_comm]
      · refine Finset.sum_congr rfl fun k _ => ?_
        have : ζ ^ (k * (r - j)) * ((n.divisors.card : ZMod p) * ζ ^ k) =
            (n.divisors.card : ZMod p) * (ζ ^ (k * (r - j)) * ζ ^ k) := by ring
        rw [this, ← pow_add]
        congr 2
        ring
    rw [hexpand, sub_eq_zero] at hzero
    -- Evaluate both geometric sums
    have hterm1 : ∑ d ∈ n.divisors, ∑ k ∈ range r, ζ ^ (k * (d + (r - j))) =
        (r : ZMod p) * (c j : ZMod p) := by
      simp_rw [hgeom]
      have hiff : ∀ d : ℕ, r ∣ (d + (r - j)) ↔ d % r = j := by
        intro d
        rw [← ZMod.natCast_eq_zero_iff, Nat.cast_add, Nat.cast_sub hj.le, ZMod.natCast_self,
          zero_sub, add_neg_eq_zero, ZMod.natCast_eq_natCast_iff, Nat.ModEq, Nat.mod_eq_of_lt hj]
      have hcongr : ∑ d ∈ n.divisors, (if r ∣ (d + (r - j)) then (r : ZMod p) else 0) =
          ∑ d ∈ n.divisors, (if d % r = j then (r : ZMod p) else 0) :=
        Finset.sum_congr rfl fun d _ => by simp only [hiff d]
      rw [hcongr, ← Finset.sum_filter, Finset.sum_const, nsmul_eq_mul, mul_comm]
    have hterm2 : ∑ k ∈ range r, ζ ^ (k * (1 + (r - j))) = if j = 1 then (r : ZMod p) else 0 := by
      rw [hgeom]
      have hiff : r ∣ (1 + (r - j)) ↔ j = 1 := by
        rw [← ZMod.natCast_eq_zero_iff, Nat.cast_add, Nat.cast_sub hj.le, ZMod.natCast_self,
          zero_sub, add_neg_eq_zero, ZMod.natCast_eq_natCast_iff, Nat.ModEq, Nat.mod_eq_of_lt hj,
          Nat.mod_eq_of_lt (by omega), eq_comm]
      simp only [hiff]
    rw [hterm1, hterm2] at hzero
    apply mul_left_cancel₀ hr_ne_p
    split_ifs at hzero ⊢ with hj1
    · rw [hzero, mul_comm]
    · rw [hzero, mul_zero, mul_zero]
  -- Step 1: Prove ¬ r ∣ n
  have hr_ndvd_n : ¬ r ∣ n := by
    intro hrn
    obtain ⟨n', hn'⟩ := hrn
    have hn'_pos : 0 < n' := by
      rcases Nat.eq_zero_or_pos n' with rfl | hpos
      · simp at hn'; omega
      · exact hpos
    have hcop : r.Coprime n' := (Nat.squarefree_mul_iff.mp (hn' ▸ hs)).1
    have hsq' : Squarefree n' := (Nat.squarefree_mul_iff.mp (hn' ▸ hs)).2.2
    have hfilt : n.divisors.filter (fun d => d % r = 0) = n'.divisors.image (r * ·) := by
      ext d
      simp only [mem_filter, Nat.mem_divisors, mem_image]
      constructor
      · rintro ⟨⟨hdn, _⟩, hdmod⟩
        have hrd : r ∣ d := Nat.dvd_of_mod_eq_zero hdmod
        obtain ⟨d', rfl⟩ := hrd
        refine ⟨d', ⟨?_, hn'_pos.ne'⟩, rfl⟩
        rw [hn'] at hdn
        exact (mul_dvd_mul_iff_left (by omega)).mp hdn
      · rintro ⟨d', ⟨hd', _⟩, rfl⟩
        refine ⟨⟨?_, hn.ne'⟩, Nat.mul_mod_right r d'⟩
        rw [hn']
        exact mul_dvd_mul_left r hd'
    have hc0 : c 0 = 2 ^ n'.primeFactors.card := by
      dsimp [c]
      rw [hfilt, Finset.card_image_of_injective _ (mul_right_injective₀ (by omega)),
        card_divisors_of_squarefree hn'_pos hsq']
    have h0 := hc_modp 0 (by omega)
    simp only [show (0 : ℕ) ≠ 1 by decide, ite_false, hc0, Nat.cast_pow, Nat.cast_ofNat] at h0
    exact pow_ne_zero _ h2_ne_p h0
  -- Step 2: Prove every prime factor q ∈ n.primeFactors satisfies q ≡ 1 (mod r)
  have hprime_mod1 : ∀ q ∈ n.primeFactors, Nat.ModEq r q 1 := by
    intro q₀ hq₀
    by_contra hq₀_ne
    -- Build unit map u : ℕ → (ZMod r)ˣ for integers coprime to r
    obtain ⟨gr, hgr_ord, hgr_gen⟩ := exists_generator_zmod_units r
    have hgr_ord_eq : orderOf gr = 2 ^ (2 ^ m) := by rw [hgr_ord, hr_sub]
    have hq_unit : ∀ q ∈ n.primeFactors, (q : ZMod r) ≠ 0 := by
      intro q hq h0
      have hrq : r ∣ q := (ZMod.natCast_eq_zero_iff q r).mp h0
      exact hr_ndvd_n (dvd_trans hrq (Nat.dvd_of_mem_primeFactors hq))
    have he_exists : ∀ q : ℕ, ∃ e : ℕ, ∀ hq : q ∈ n.primeFactors,
        (gr ^ e : (ZMod r)ˣ).val = (q : ZMod r) := by
      intro q
      by_cases hq : q ∈ n.primeFactors
      · obtain ⟨e, he⟩ := hgr_gen (Units.mk0 (q : ZMod r) (hq_unit q hq))
        refine ⟨e, fun _ => ?_⟩
        rw [he]
        rfl
      · exact ⟨0, fun h => absurd h hq⟩
    choose e he_spec using he_exists
    -- For q₀, ¬ (2^(2^m) ∣ e q₀)
    have hndvd_q0 : ¬ (2 ^ (2 ^ m) ∣ e q₀) := by
      intro hdvd
      have h1 : gr ^ (e q₀) = 1 := by
        rw [← orderOf_dvd_iff_pow_eq_one, hgr_ord_eq]
        exact hdvd
      have hval : (q₀ : ZMod r) = 1 := by
        rw [← he_spec q₀ hq₀, h1, Units.val_one]
      have hmod : Nat.ModEq r q₀ 1 := (ZMod.natCast_eq_natCast_iff q₀ 1 r).mp (by simpa using hval)
      exact hq₀_ne hmod
    obtain ⟨v, k, hv_lt, heq0⟩ := exists_two_pow_mul_odd (2 ^ m) (e q₀) hndvd_q0
    -- Polynomial F = ∏ q ∈ n.primeFactors, (1 + X ^ (e q)) in (ZMod p)[X]
    set M : (ZMod p)[X] := X ^ (2 ^ v) + 1
    set F : (ZMod p)[X] := ∏ q ∈ n.primeFactors, (1 + X ^ (e q))
    -- 1) M ∣ F (because M ∣ (1 + X ^ (e q₀)) ∣ F)
    have hM_dvd_F : M ∣ F := by
      have h1 : (1 + X ^ (e q₀) : (ZMod p)[X]) ∣ F := Finset.dvd_prod_of_mem _ hq₀
      have h2 : M ∣ (1 + X ^ (e q₀)) := by
        dsimp [M]
        rw [add_comm (1 : (ZMod p)[X]), heq0, pow_mul]
        exact add_one_dvd_pow_odd_add_one (X ^ (2 ^ v)) k
      exact dvd_trans h2 h1
    -- 2) M ∣ (X ^ (r - 1) - 1)
    have hM_dvd_Xr1 : M ∣ (X ^ (r - 1) - 1) := by
      have h1 : M ∣ (X ^ (2 ^ (v + 1)) - 1) := by
        dsimp [M]
        refine ⟨X ^ (2 ^ v) - 1, ?_⟩
        rw [pow_succ, pow_mul]
        ring
      have h2 : 2 ^ (v + 1) ∣ (r - 1) := by
        rw [hr_sub]
        exact Nat.pow_dvd_pow 2 (by omega)
      obtain ⟨t, ht⟩ := h2
      have h3 : (X ^ (2 ^ (v + 1)) - 1 : (ZMod p)[X]) ∣ (X ^ (r - 1) - 1) := by
        rw [ht, pow_mul]
        exact sub_one_dvd_pow_sub_one' (X ^ (2 ^ (v + 1))) t
      exact dvd_trans h1 h3
    -- 3) If a % (r - 1) = b % (r - 1), then M ∣ (X ^ a - X ^ b)
    have hM_dvd_pow_diff : ∀ a b : ℕ, a % (r - 1) = b % (r - 1) →
        M ∣ (X ^ a - X ^ b : (ZMod p)[X]) := by
      have hle_case : ∀ a b : ℕ, a ≤ b → a % (r - 1) = b % (r - 1) →
          M ∣ (X ^ b - X ^ a : (ZMod p)[X]) := by
        intro a b hab hmod
        have hdvd : (r - 1) ∣ (b - a) := (Nat.modEq_iff_dvd' hab).mp hmod
        obtain ⟨t, ht⟩ := hdvd
        have hb : b = a + (r - 1) * t := by omega
        have hfac : (X ^ b - X ^ a : (ZMod p)[X]) = X ^ a * ((X ^ (r - 1)) ^ t - 1) := by
          rw [hb, pow_add, pow_mul]
          ring
        rw [hfac]
        exact dvd_mul_of_dvd_right (dvd_trans hM_dvd_Xr1 (sub_one_dvd_pow_sub_one' _ t)) _
      intro a b hmod
      rcases le_total a b with hab | hba
      · rw [show (X ^ a - X ^ b : (ZMod p)[X]) = -(X ^ b - X ^ a) by ring]
        exact dvd_neg.mpr (hle_case a b hab hmod)
      · exact hle_case b a hba hmod.symm
    -- Choose canonical exponent b : ZMod r → ℕ for each residue class, with b 1 = 0
    have hb_exists : ∀ z : ZMod r, ∃ t : ℕ, (z = 1 → t = 0) ∧
        (z ≠ 0 → (gr ^ t : (ZMod r)ˣ).val = z) := by
      intro z
      by_cases hz1 : z = 1
      · refine ⟨0, fun _ => rfl, fun _ => ?_⟩
        rw [pow_zero, Units.val_one, hz1]
      · by_cases hz0 : z = 0
        · exact ⟨0, fun h => absurd h hz1, fun h => absurd hz0 h⟩
        · obtain ⟨t, ht⟩ := hgr_gen (Units.mk0 z hz0)
          refine ⟨t, fun h => absurd h hz1, fun _ => ?_⟩
          rw [ht]; rfl
    choose b hb_one hb_val using hb_exists
    -- Expand F = ∑ S ∈ n.primeFactors.powerset, X ^ (∑ q ∈ S, e q)
    have hF_expand : F = ∑ S ∈ n.primeFactors.powerset, X ^ (∑ q ∈ S, e q) := by
      dsimp [F]
      rw [Finset.prod_one_add]
      refine Finset.sum_congr rfl fun S _ => ?_
      rw [Finset.prod_pow_eq_pow_sum]
    -- Show M ∣ (F - ∑ S ∈ powerset, X ^ (b ((∏ q ∈ S, q : ℕ) : ZMod r)))
    have hM_dvd_sub : M ∣ (F - ∑ S ∈ n.primeFactors.powerset,
        X ^ (b ((∏ q ∈ S, q : ℕ) : ZMod r))) := by
      rw [hF_expand, ← Finset.sum_sub_distrib]
      apply Finset.dvd_sum
      intro S hS
      have hS_sub : S ⊆ n.primeFactors := mem_powerset.mp hS
      have hprod_ne0 : ((∏ q ∈ S, q : ℕ) : ZMod r) ≠ 0 := by
        rw [Nat.cast_prod]
        exact Finset.prod_ne_zero_iff.mpr fun q hq => hq_unit q (hS_sub hq)
      have hpow_eq : gr ^ (∑ q ∈ S, e q) = gr ^ (b ((∏ q ∈ S, q : ℕ) : ZMod r)) := by
        apply Units.ext
        rw [Units.val_pow_eq_pow_val, ← Finset.prod_pow_eq_pow_sum]
        have h1 : ∏ q ∈ S, (gr : ZMod r) ^ (e q) = ∏ q ∈ S, (q : ZMod r) := by
          refine Finset.prod_congr rfl fun q hq => ?_
          rw [← Units.val_pow_eq_pow_val, he_spec q (hS_sub hq)]
        rw [h1, ← Nat.cast_prod, hb_val _ hprod_ne0]
      have hmod_ord : (∑ q ∈ S, e q) % (r - 1) = (b ((∏ q ∈ S, q : ℕ) : ZMod r)) % (r - 1) := by
        rw [← hgr_ord]
        exact pow_eq_pow_iff_modEq.mp hpow_eq
      exact hM_dvd_pow_diff _ _ hmod_ord
    -- Evaluate the canonical sum via divisors and hc_modp
    have hcanon_sum : (∑ S ∈ n.primeFactors.powerset,
        (X ^ (b ((∏ q ∈ S, q : ℕ) : ZMod r)) : (ZMod p)[X])) =
        C ((n.divisors.card : ZMod p)) := by
      obtain ⟨hdiv_eq, hdiv_inj⟩ := divisors_eq_powerset_image hn hs
      have h1 : (∑ S ∈ n.primeFactors.powerset,
          (X ^ (b ((∏ q ∈ S, q : ℕ) : ZMod r)) : (ZMod p)[X])) =
          ∑ d ∈ n.divisors, (X ^ (b (d : ZMod r)) : (ZMod p)[X]) := by
        rw [hdiv_eq, Finset.sum_image hdiv_inj]
      rw [h1]
      -- Group by j = d % r ∈ range r
      have hgroup : (∑ d ∈ n.divisors, (X ^ (b (d : ZMod r)) : (ZMod p)[X])) =
          ∑ j ∈ range r, ∑ d ∈ n.divisors.filter (fun d => d % r = j),
            (X ^ (b (d : ZMod r)) : (ZMod p)[X]) := by
        rw [← Finset.sum_fiberwise_of_maps_to (g := fun d => d % r)
          (t := range r) (fun d _ => mem_range.mpr (Nat.mod_lt d (by omega)))]
      rw [hgroup]
      have hinner : ∀ j ∈ range r,
          (∑ d ∈ n.divisors.filter (fun d => d % r = j),
            (X ^ (b (d : ZMod r)) : (ZMod p)[X])) =
          C (c j : ZMod p) * X ^ (b (j : ZMod r)) := by
        intro j _
        have hcongr : ∑ d ∈ n.divisors.filter (fun d => d % r = j),
            (X ^ (b (d : ZMod r)) : (ZMod p)[X]) =
            ∑ _ ∈ n.divisors.filter (fun d => d % r = j),
            (X ^ (b (j : ZMod r)) : (ZMod p)[X]) := by
          refine Finset.sum_congr rfl fun d hd => ?_
          have hdj : d % r = j := (mem_filter.mp hd).2
          have hdz : (d : ZMod r) = (j : ZMod r) := by
            rw [← ZMod.natCast_mod d r, hdj]
          rw [hdz]
        rw [hcongr, Finset.sum_const, nsmul_eq_mul, map_natCast]
      rw [Finset.sum_congr rfl hinner]
      have h1_mem : 1 ∈ range r := mem_range.mpr (by omega)
      rw [← Finset.add_sum_erase _ _ h1_mem]
      have herase0 : ∑ j ∈ (range r).erase 1,
          C (c j : ZMod p) * (X ^ (b (j : ZMod r)) : (ZMod p)[X]) = 0 := by
        apply Finset.sum_eq_zero
        intro j hj
        have hj1 : j ≠ 1 := (mem_erase.mp hj).1
        have hjr : j < r := mem_range.mp (mem_of_mem_erase hj)
        rw [hc_modp j hjr, ite_eq_right hj1, C_0, zero_mul]
      rw [herase0, add_zero, hc_modp 1 (by omega), ite_eq_left rfl, Nat.cast_one, hb_one 1 rfl,
        pow_zero, mul_one]
    -- Combine M ∣ F and M ∣ (F - C (n.divisors.card)) to get M ∣ C (n.divisors.card)
    rw [hcanon_sum] at hM_dvd_sub
    have hM_dvd_C : M ∣ C (n.divisors.card : ZMod p) := by
      have : C (n.divisors.card : ZMod p) = F - (F - C (n.divisors.card : ZMod p)) := by ring
      rw [this]
      exact dvd_sub hM_dvd_F hM_dvd_sub
    -- Contradiction on degrees!
    have hC_ne : (C (n.divisors.card : ZMod p) : (ZMod p)[X]) ≠ 0 := by
      rw [ne_eq, C_eq_zero, card_divisors_of_squarefree hn hs]
      push_cast
      exact pow_ne_zero _ h2_ne_p
    have hM_deg : M.natDegree = 2 ^ v := by
      dsimp [M]
      have hlt : (1 : (ZMod p)[X]).natDegree < (X ^ (2 ^ v) : (ZMod p)[X]).natDegree := by
        rw [natDegree_one, natDegree_X_pow]
        exact Nat.one_le_two_pow
      rw [natDegree_add_eq_left_of_natDegree_lt hlt, natDegree_X_pow]
    have hle := natDegree_le_of_dvd hM_dvd_C hC_ne
    rw [hM_deg, natDegree_C] at hle
    have h2v_pos : 1 ≤ 2 ^ v := Nat.one_le_two_pow
    omega
  -- Step 3: Every divisor d ∈ n.divisors is a product of primes in n.primeFactors, hence ≡ 1 (mod r)
  intro d hd
  obtain ⟨hdiv_eq, _⟩ := divisors_eq_powerset_image hn hs
  rw [hdiv_eq] at hd
  rcases mem_image.mp hd with ⟨S, hS, rfl⟩
  have hS_sub : S ⊆ n.primeFactors := mem_powerset.mp hS
  rw [← ZMod.natCast_eq_natCast_iff, Nat.cast_prod, Nat.cast_one]
  apply Finset.prod_eq_one
  intro q hq
  have hmod := hprime_mod1 q (hS_sub hq)
  simpa using (ZMod.natCast_eq_natCast_iff q 1 r).mpr hmod
