import Mathlib

open Polynomial

lemma p2_sum_pow_lt {p : ℕ} [Fact p.Prime] (e : ℕ) (he : e < p - 1) :
    ∑ x : ZMod p, x ^ e = 0 := by
  have := FiniteField.sum_pow_lt_card_sub_one (ZMod p) e (by rwa [ZMod.card])
  exact this

lemma p2_sum_pow_top {p : ℕ} [Fact p.Prime] :
    ∑ x : ZMod p, x ^ (p - 1) = -1 := by
  have hp : 2 ≤ p := (Fact.out : p.Prime).two_le
  have h1 : ∀ x : ZMod p, x ^ (p - 1) = 1 - (if x = 0 then 1 else 0) := by
    intro x
    by_cases hx : x = 0
    · subst hx
      rw [zero_pow (by omega)]
      simp
    · rw [ZMod.pow_card_sub_one_eq_one hx]
      simp [hx]
  simp_rw [h1]
  rw [Finset.sum_sub_distrib]
  simp

lemma p2_key {p : ℕ} [Fact p.Prime] (f : ZMod p → ZMod p) (M : Finset (ZMod p))
    (hM : ∀ m ∈ M, Function.Injective (fun x => f x - m * x))
    (t : ℕ) (ht1 : 1 ≤ t) (ht2 : t ≤ p - 2) (htM : t ≤ M.card) (j : ℕ) (hj : j < t) :
    ∑ x : ZMod p, x ^ j * f x ^ (t - j) = 0 := by
  classical
  set c : ℕ → ZMod p := fun j => (Nat.choose t j : ZMod p) * (-1) ^ j *
    ∑ x : ZMod p, x ^ j * f x ^ (t - j) with hc
  set Q : (ZMod p)[X] := ∑ j ∈ Finset.range t, C (c j) * X ^ j with hQ
  have hevalQ : ∀ m : ZMod p, Q.eval m = ∑ x : ZMod p, (f x - m * x) ^ t := by
    intro m
    have h1 : ∀ x : ZMod p, (f x - m * x) ^ t = ∑ j ∈ Finset.range (t+1),
        (-(m * x)) ^ j * f x ^ (t - j) * (Nat.choose t j : ZMod p) := by
      intro x
      rw [sub_eq_add_neg, add_comm, add_pow]
    simp_rw [h1]
    rw [Finset.sum_comm, Finset.sum_range_succ]
    have hlast : ∑ x : ZMod p, (-(m * x)) ^ t * f x ^ (t - t) * (Nat.choose t t : ZMod p) = 0 := by
      have : ∀ x : ZMod p, (-(m * x)) ^ t * f x ^ (t - t) * (Nat.choose t t : ZMod p)
          = (-m) ^ t * x ^ t := by
        intro x
        simp only [Nat.sub_self, pow_zero, mul_one, Nat.choose_self, Nat.cast_one]
        ring
      simp_rw [this]
      rw [← Finset.mul_sum, p2_sum_pow_lt t (by omega), mul_zero]
    rw [hlast, add_zero]
    rw [hQ, eval_finset_sum]
    refine Finset.sum_congr rfl fun j _ => ?_
    rw [eval_mul, eval_C, eval_pow, eval_X, hc]
    simp only
    have : ∀ x : ZMod p, (-(m * x)) ^ j * f x ^ (t - j) * (Nat.choose t j : ZMod p)
        = ((Nat.choose t j : ZMod p) * (-m) ^ j) * (x ^ j * f x ^ (t - j)) := by
      intro x; ring
    simp_rw [this]
    rw [← Finset.mul_sum]
    ring
  have hQ0 : ∀ m ∈ M, Q.eval m = 0 := by
    intro m hm
    rw [hevalQ m]
    have hbij : Function.Bijective (fun x => f x - m * x) :=
      Finite.injective_iff_bijective.mp (hM m hm)
    calc ∑ x : ZMod p, (f x - m * x) ^ t = ∑ y : ZMod p, y ^ t :=
          hbij.sum_comp (fun y => y ^ t)
      _ = 0 := p2_sum_pow_lt t (by omega)
  have hdeg : Q.natDegree < M.card := by
    have : Q.natDegree ≤ t - 1 := by
      apply natDegree_sum_le_of_forall_le
      intro j hj'
      refine (natDegree_C_mul_X_pow_le _ _).trans ?_
      have := Finset.mem_range.mp hj'
      omega
    omega
  have hQz : Q = 0 := eq_zero_of_natDegree_lt_card_of_eval_eq_zero' Q M hQ0 hdeg
  have hcoef : Q.coeff j = c j := by
    rw [hQ, finset_sum_coeff]
    simp only [coeff_C_mul_X_pow]
    rw [Finset.sum_eq_single j]
    · simp
    · intro j' _ hne
      rw [if_neg]
      exact fun h => hne h.symm
    · intro h
      exact absurd (Finset.mem_range.mpr hj) h
  rw [hQz, coeff_zero] at hcoef
  have hch : (Nat.choose t j : ZMod p) ≠ 0 := by
    intro h
    rw [ZMod.natCast_eq_zero_iff] at h
    have h2 : p ∣ t.factorial := by
      have := Nat.add_choose_mul_factorial_mul_factorial j (t - j)
      have h3 : t.factorial = Nat.choose t j * j.factorial * (t - j).factorial := by
        have h4 := Nat.choose_mul_factorial_mul_factorial (show j ≤ t by omega)
        rw [← h4]
      rw [h3]
      exact Dvd.dvd.mul_right (Dvd.dvd.mul_right h _) _
    rw [(Fact.out : p.Prime).dvd_factorial] at h2
    omega
  have hc0 : c j = 0 := hcoef.symm
  rw [hc] at hc0
  simp only at hc0
  rcases mul_eq_zero.mp hc0 with h | h
  · rcases mul_eq_zero.mp h with h' | h'
    · exact absurd h' hch
    · exact absurd h' (pow_ne_zero _ (neg_ne_zero.mpr one_ne_zero))
  · exact h

lemma p2_arith (p d : ℕ) (hodd : p % 2 = 1) (hd2 : 2 ≤ d) (hdp : d ≤ p - 1) :
    (p - 1) + 2 * ((p - 1) / d) ≤ 2 * ((p - 1) / d * d) := by
  have h := Nat.div_add_mod (p - 1) d
  have hr : (p - 1) % d < d := Nat.mod_lt _ (by omega)
  generalize (p - 1) / d = i at *
  generalize (p - 1) % d = r at *
  by_cases hd : d = 2
  · subst hd
    omega
  · by_cases hi : i = 1
    · subst hi
      omega
    · have hi2 : 2 ≤ i := by
        rcases Nat.lt_or_ge i 2 with h' | h'
        · exfalso
          interval_cases i
          · simp at h
            omega
          · exact hi rfl
        · exact h'
      obtain ⟨i', rfl⟩ : ∃ i', i = i' + 2 := ⟨i - 2, by omega⟩
      obtain ⟨d', rfl⟩ : ∃ d', d = d' + 3 := ⟨d - 3, by omega⟩
      nlinarith

theorem problem2 (p : ℕ) [Fact p.Prime] (hp : 2 < p)
    (f : ZMod p → ZMod p)
    (hf : ¬ ∃ a b : ZMod p, ∀ x, f x = a * x + b) :
    p + 3 ≤ 2 * Set.ncard {m : ZMod p |
      ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} := by
  classical
  by_contra hlt
  rw [not_le] at hlt
  set D : Set (ZMod p) := {m : ZMod p | ∃ x y : ZMod p, x ≠ y ∧ f x - f y = m * (x - y)} with hD
  have hodd : p % 2 = 1 := Nat.odd_iff.mp ((Fact.out : p.Prime).odd_of_ne_two (by omega))
  have hcard : D.ncard + Dᶜ.ncard = p := by
    have := Set.ncard_add_ncard_compl D
    rwa [Nat.card_zmod] at this
  set M : Finset (ZMod p) := Finset.univ.filter (fun m => m ∉ D) with hM
  have hMeq : (M : Set (ZMod p)) = Dᶜ := by
    ext m
    simp [hM]
  have hMcard : M.card = Dᶜ.ncard := by
    rw [← Set.ncard_coe_finset, hMeq]
  have h2k : p - 1 ≤ 2 * M.card := by omega
  have hMinj : ∀ m ∈ M, Function.Injective (fun x => f x - m * x) := by
    intro m hm x y hxy
    by_contra hne
    have hmD : m ∉ D := by simpa [hM] using hm
    apply hmD
    refine ⟨x, y, hne, ?_⟩
    simp only at hxy
    linear_combination hxy
  -- interpolation polynomial
  set F : (ZMod p)[X] := Lagrange.interpolate Finset.univ (fun x : ZMod p => x) f with hF
  have hinjv : Set.InjOn (fun x : ZMod p => x) (Finset.univ : Finset (ZMod p)) :=
    fun a _ b _ h => h
  have hFev : ∀ x, F.eval x = f x := fun x =>
    Lagrange.eval_interpolate_at_node (r := f) hinjv (Finset.mem_univ x)
  have hFdeg : F.natDegree < p := by
    by_cases h0 : F = 0
    · rw [h0]; simp; omega
    · rw [natDegree_lt_iff_degree_lt h0]
      have := Lagrange.degree_interpolate_lt (r := f) hinjv
      rw [Finset.card_univ, ZMod.card] at this
      exact this
  set d := F.natDegree with hd
  have hd2 : 2 ≤ d := by
    by_contra hd'
    apply hf
    have h1 : F.natDegree ≤ 1 := by omega
    refine ⟨F.coeff 1, F.coeff 0, fun x => ?_⟩
    rw [← hFev x]
    conv_lhs => rw [eq_X_add_C_of_natDegree_le_one h1]
    simp
  have hdp : d ≤ p - 1 := by omega
  have hF0 : F ≠ 0 := by
    intro h0
    rw [h0] at hd
    simp at hd
    omega
  obtain ⟨i, hi⟩ : ∃ i, i = (p - 1) / d := ⟨_, rfl⟩
  have hi1 : 1 ≤ i := by rw [hi]; exact Nat.div_pos hdp (by omega)
  obtain ⟨e, he⟩ : ∃ e, e = i * d := ⟨_, rfl⟩
  have hide : e ≤ p - 1 := by rw [he, hi]; exact Nat.div_mul_le_self _ _
  have harith := p2_arith p d hodd hd2 hdp
  rw [← hi, ← he] at harith
  have hed : 2 * i ≤ e := by
    rw [he]
    have := Nat.mul_le_mul_left i hd2
    omega
  obtain ⟨j, hj⟩ : ∃ j, j = p - 1 - e := ⟨_, rfl⟩
  have hkey := p2_key f M hMinj (i + j) (by omega) (by omega) (by omega) j (by omega)
  rw [show i + j - j = i by omega] at hkey
  -- compute the power sum via F^i
  have hnd : (F ^ i).natDegree = e := by rw [natDegree_pow, he]
  have hsum : ∑ x : ZMod p, x ^ j * f x ^ i = - (F ^ i).coeff e := by
    have h1 : ∀ x : ZMod p, x ^ j * f x ^ i
        = ∑ s ∈ Finset.range (e + 1), (F ^ i).coeff s * x ^ (j + s) := by
      intro x
      rw [← hFev x, ← eval_pow, eval_eq_sum_range, hnd, Finset.mul_sum]
      refine Finset.sum_congr rfl fun s _ => ?_
      rw [pow_add]; ring
    simp_rw [h1]
    rw [Finset.sum_comm]
    simp_rw [← Finset.mul_sum]
    rw [Finset.sum_eq_single e]
    · have : j + e = p - 1 := by omega
      rw [this, p2_sum_pow_top]
      ring
    · intro s hs hne
      have hs' : s < e := by
        have := Finset.mem_range.mp hs
        omega
      rw [p2_sum_pow_lt (j + s) (by omega), mul_zero]
    · intro h
      exact absurd (Finset.mem_range.mpr (Nat.lt_succ_self e)) h
  rw [hsum] at hkey
  have hlc : (F ^ i).coeff e = F.leadingCoeff ^ i := by
    rw [← hnd, ← leadingCoeff, leadingCoeff_pow]
  rw [hlc, neg_eq_zero] at hkey
  exact (pow_ne_zero _ (leadingCoeff_ne_zero.mpr hF0)) hkey
