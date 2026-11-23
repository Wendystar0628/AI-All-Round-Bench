import Mathlib

open Polynomial

/-- `(9/2)^i ≥ i + 1`。 -/
lemma p6_bern (i : ℕ) : (i : ℝ) + 1 ≤ (9 / 2 : ℝ) ^ i := by
  induction i with
  | zero => norm_num
  | succ k ih =>
    rw [pow_succ]
    push_cast
    have hk : (0 : ℝ) ≤ k := Nat.cast_nonneg k
    linarith

/-- 几何差的范数估计：`‖x^(j+1) - y^(j+1)‖ ≤ (j+1) ρ^j ‖x - y‖`。 -/
lemma p6_pow_sub_bound (x y : ℂ) (ρ : ℝ) (j : ℕ) (hx : ‖x‖ ≤ ρ) (hy : ‖y‖ ≤ ρ) :
    ‖x ^ (j + 1) - y ^ (j + 1)‖ ≤ ((j : ℝ) + 1) * ρ ^ j * ‖x - y‖ := by
  have hρ : 0 ≤ ρ := (norm_nonneg x).trans hx
  have h := geom_sum₂_mul x y (j + 1)
  rw [← h, norm_mul]
  apply mul_le_mul_of_nonneg_right _ (norm_nonneg _)
  refine (norm_sum_le _ _).trans ?_
  have hterm : ∀ i ∈ Finset.range (j + 1), ‖x ^ i * y ^ (j + 1 - 1 - i)‖ ≤ ρ ^ j := by
    intro i hi
    have hi' : i < j + 1 := Finset.mem_range.mp hi
    rw [norm_mul, norm_pow, norm_pow]
    calc ‖x‖ ^ i * ‖y‖ ^ (j + 1 - 1 - i) ≤ ρ ^ i * ρ ^ (j + 1 - 1 - i) :=
          mul_le_mul (pow_le_pow_left₀ (norm_nonneg _) hx _)
            (pow_le_pow_left₀ (norm_nonneg _) hy _) (by positivity) (by positivity)
      _ = ρ ^ j := by
          rw [← pow_add]
          congr 1
          omega
  calc ∑ i ∈ Finset.range (j + 1), ‖x ^ i * y ^ (j + 1 - 1 - i)‖
      ≤ ∑ i ∈ Finset.range (j + 1), ρ ^ j := Finset.sum_le_sum hterm
    _ = ((j : ℝ) + 1) * ρ ^ j := by simp

/-- 系数在 `[0,9]` 内的整系数和的差的范数估计。 -/
lemma p6_diff_bound (g : ℕ → ℤ) (hg : ∀ i, 0 ≤ g i ∧ g i ≤ 9) (w t : ℂ) (N : ℕ)
    (hw : ‖w‖ ≤ 1 / 9) (ht : ‖t‖ ≤ 1 / 9) (hwt : ‖w - t‖ ≤ 1 / 90) :
    ‖∑ i ∈ Finset.range N, ((g i : ℤ) : ℂ) * (w ^ i - t ^ i)‖ ≤ 1 / 5 := by
  cases N with
  | zero => simp
  | succ m =>
    rw [Finset.sum_range_succ']
    simp only [pow_zero, sub_self, mul_zero, add_zero]
    refine (norm_sum_le _ _).trans ?_
    have hterm : ∀ i ∈ Finset.range m,
        ‖((g (i + 1) : ℤ) : ℂ) * (w ^ (i + 1) - t ^ (i + 1))‖ ≤ (1 / 10) * (1 / 2 : ℝ) ^ i := by
      intro i _
      rw [norm_mul]
      have hgn : ‖((g (i + 1) : ℤ) : ℂ)‖ ≤ 9 := by
        have h1 := hg (i + 1)
        rw [Complex.norm_intCast]
        have h2 : (g (i + 1) : ℝ) ≤ 9 := by exact_mod_cast h1.2
        have h3 : (0 : ℝ) ≤ (g (i + 1) : ℝ) := by exact_mod_cast h1.1
        rw [abs_le]
        constructor <;> linarith
      have hpow := p6_pow_sub_bound w t (1 / 9) i hw ht
      have hbern : ((i : ℝ) + 1) * (1 / 9 : ℝ) ^ i ≤ (1 / 2 : ℝ) ^ i := by
        have e : (1 / 2 : ℝ) ^ i = (9 / 2 : ℝ) ^ i * (1 / 9 : ℝ) ^ i := by
          rw [← mul_pow]
          norm_num
        rw [e]
        exact mul_le_mul_of_nonneg_right (p6_bern i) (by positivity)
      have h2 : ((i : ℝ) + 1) * (1 / 9 : ℝ) ^ i * ‖w - t‖ ≤ (1 / 2 : ℝ) ^ i * (1 / 90) := by
        have hn : 0 ≤ ‖w - t‖ := norm_nonneg _
        calc ((i : ℝ) + 1) * (1 / 9 : ℝ) ^ i * ‖w - t‖
            ≤ (1 / 2 : ℝ) ^ i * ‖w - t‖ := mul_le_mul_of_nonneg_right hbern hn
          _ ≤ (1 / 2 : ℝ) ^ i * (1 / 90) := mul_le_mul_of_nonneg_left hwt (by positivity)
      calc ‖((g (i + 1) : ℤ) : ℂ)‖ * ‖w ^ (i + 1) - t ^ (i + 1)‖
          ≤ 9 * (((i : ℝ) + 1) * (1 / 9 : ℝ) ^ i * ‖w - t‖) :=
            mul_le_mul hgn hpow (norm_nonneg _) (by norm_num)
        _ ≤ 9 * ((1 / 2 : ℝ) ^ i * (1 / 90)) := mul_le_mul_of_nonneg_left h2 (by norm_num)
        _ = (1 / 10) * (1 / 2 : ℝ) ^ i := by ring
    calc ∑ i ∈ Finset.range m, ‖((g (i + 1) : ℤ) : ℂ) * (w ^ (i + 1) - t ^ (i + 1))‖
        ≤ ∑ i ∈ Finset.range m, (1 / 10) * (1 / 2 : ℝ) ^ i := Finset.sum_le_sum hterm
      _ = (1 / 10) * ∑ i ∈ Finset.range m, (1 / 2 : ℝ) ^ i := by rw [Finset.mul_sum]
      _ ≤ (1 / 10) * 2 := mul_le_mul_of_nonneg_left (sum_geometric_two_le m) (by norm_num)
      _ = 1 / 5 := by norm_num

/-- 整系数多项式（系数在 `[0,9]`，首项系数 `≥ 1`）在 `|w - 1/10| ≤ 1/90` 的区域内不为零。 -/
lemma p6_eval_ne_zero (G : ℤ[X]) (hdig : ∀ i, 0 ≤ G.coeff i ∧ G.coeff i ≤ 9)
    (h0 : 1 ≤ G.coeff 0) (w : ℂ) (hw : ‖w‖ ≤ 1 / 9) (hwt : ‖w - 1 / 10‖ ≤ 1 / 90) :
    eval₂ (Int.castRingHom ℂ) w G ≠ 0 := by
  intro hzero
  set N := G.natDegree + 1 with hN
  set S : ℝ := ∑ i ∈ Finset.range N, (G.coeff i : ℝ) * (1 / 10 : ℝ) ^ i with hS
  have hS1 : 1 ≤ S := by
    have hnn : ∀ i ∈ Finset.range N, 0 ≤ (G.coeff i : ℝ) * (1 / 10 : ℝ) ^ i := fun i _ => by
      have := hdig i
      exact mul_nonneg (by exact_mod_cast this.1) (pow_nonneg (by norm_num) _)
    have h := Finset.single_le_sum hnn (Finset.mem_range.mpr (Nat.succ_pos G.natDegree))
    simp only [pow_zero, mul_one] at h
    have : (1 : ℝ) ≤ (G.coeff 0 : ℝ) := by exact_mod_cast h0
    linarith
  have h10 : ‖(1 / 10 : ℂ)‖ ≤ 1 / 9 := by
    rw [norm_div, norm_one]
    norm_num
  have hD : ‖∑ i ∈ Finset.range N, ((G.coeff i : ℤ) : ℂ) * (w ^ i - (1 / 10 : ℂ) ^ i)‖ ≤ 1 / 5 :=
    p6_diff_bound (fun i => G.coeff i) hdig w (1 / 10) N hw h10 hwt
  have hkey : eval₂ (Int.castRingHom ℂ) w G
      = (S : ℂ) + ∑ i ∈ Finset.range N, ((G.coeff i : ℤ) : ℂ) * (w ^ i - (1 / 10 : ℂ) ^ i) := by
    rw [eval₂_eq_sum_range, hS]
    push_cast
    rw [← Finset.sum_add_distrib]
    apply Finset.sum_congr rfl
    intro i _
    simp only [eq_intCast]
    ring
  have hsum_eq : (S : ℂ) = -(∑ i ∈ Finset.range N, ((G.coeff i : ℤ) : ℂ) * (w ^ i - (1 / 10 : ℂ) ^ i)) := by
    rw [hkey] at hzero
    linear_combination hzero
  have hnorm := congrArg norm hsum_eq
  rw [Complex.norm_real, norm_neg, Real.norm_eq_abs, abs_of_nonneg (by linarith)] at hnorm
  linarith

/-- 若 `‖z - 10‖ ≤ 1` 则 `f(z) ≠ 0`。 -/
lemma p6_root (f : ℤ[X]) (hdig : ∀ i, 0 ≤ f.coeff i ∧ f.coeff i ≤ 9)
    (hlead : 1 ≤ f.leadingCoeff) (z : ℂ) (hz : ‖z - 10‖ ≤ 1) :
    eval₂ (Int.castRingHom ℂ) z f ≠ 0 := by
  have hz9 : 9 ≤ ‖z‖ := by
    have h1 : ‖z - (z - 10)‖ ≤ ‖z‖ + ‖z - 10‖ := norm_sub_le _ _
    have h2 : z - (z - 10) = 10 := by ring
    rw [h2] at h1
    have h3 : ‖(10 : ℂ)‖ = 10 := by norm_num
    linarith
  have hz0 : z ≠ 0 := by
    intro h
    rw [h, norm_zero] at hz9
    norm_num at hz9
  have : Invertible z := invertibleOfNonzero hz0
  intro hzero
  have hrev := eval₂_reverse_mul_pow (Int.castRingHom ℂ) z f
  rw [hzero] at hrev
  have hG : eval₂ (Int.castRingHom ℂ) (⅟z) f.reverse = 0 := by
    rcases mul_eq_zero.mp hrev with h1 | h1
    · exact h1
    · exact absurd h1 (pow_ne_zero _ hz0)
  rw [invOf_eq_inv] at hG
  have hdigR : ∀ i, 0 ≤ f.reverse.coeff i ∧ f.reverse.coeff i ≤ 9 := fun i => by
    rw [coeff_reverse]
    exact hdig _
  have h0R : 1 ≤ f.reverse.coeff 0 := by
    rw [coeff_zero_reverse]
    exact hlead
  have hw : ‖z⁻¹‖ ≤ 1 / 9 := by
    rw [norm_inv, one_div]
    exact inv_anti₀ (by norm_num) hz9
  have hwt : ‖z⁻¹ - 1 / 10‖ ≤ 1 / 90 := by
    have e : z⁻¹ - 1 / 10 = -((z - 10) / (10 * z)) := by
      field_simp
      ring
    rw [e, norm_neg, norm_div, norm_mul]
    have h10 : ‖(10 : ℂ)‖ = 10 := by norm_num
    rw [h10, div_le_iff₀ (by linarith)]
    linarith
  exact p6_eval_ne_zero f.reverse hdigR h0R z⁻¹ hw hwt hG

/-- 若干模不小于 1 的数的乘积，只要至少一个因子，模就大于 1。 -/
lemma p6_prod_ge (s : Multiset ℂ) (hs : ∀ x ∈ s, 1 ≤ ‖x‖) : 1 ≤ ‖s.prod‖ := by
  induction s using Multiset.induction_on with
  | empty => simp
  | cons a s ih =>
    rw [Multiset.prod_cons, norm_mul]
    have ha : 1 ≤ ‖a‖ := hs a (Multiset.mem_cons_self a s)
    have hs' : ∀ x ∈ s, 1 ≤ ‖x‖ := fun x hx => hs x (Multiset.mem_cons_of_mem hx)
    nlinarith [ih hs']

lemma p6_prod_gt (s : Multiset ℂ) (hs : ∀ x ∈ s, 1 < ‖x‖) (hne : s ≠ 0) : 1 < ‖s.prod‖ := by
  induction s using Multiset.induction_on with
  | empty => exact absurd rfl hne
  | cons a s ih =>
    rw [Multiset.prod_cons, norm_mul]
    have ha : 1 < ‖a‖ := hs a (Multiset.mem_cons_self a s)
    have hs' : ∀ x ∈ s, 1 < ‖x‖ := fun x hx => hs x (Multiset.mem_cons_of_mem hx)
    by_cases hs0 : s = 0
    · subst hs0
      simpa using ha
    · have h1 : 1 < ‖s.prod‖ := ih hs' hs0
      nlinarith

/-- 若 `f = g h` 且 `deg g ≥ 1`，则 `|g(10)| > 1`。 -/
lemma p6_key (f : ℤ[X]) (hdig : ∀ i, 0 ≤ f.coeff i ∧ f.coeff i ≤ 9)
    (hlead : 1 ≤ f.leadingCoeff) (g h : ℤ[X]) (hgh : f = g * h) (hg : 0 < g.natDegree) :
    1 < ‖((g.eval 10 : ℤ) : ℂ)‖ := by
  have hf0 : f ≠ 0 := by
    intro h0
    rw [h0, leadingCoeff_zero] at hlead
    norm_num at hlead
  have hg0 : g ≠ 0 := by
    rintro rfl
    apply hf0
    rw [hgh, zero_mul]
  set gC := g.map (Int.castRingHom ℂ) with hgC
  have hgC0 : gC ≠ 0 := by
    intro h0
    apply hg0
    exact (Polynomial.map_eq_zero_iff (RingHom.injective_int _)).mp h0
  have hdeg : gC.natDegree = g.natDegree := natDegree_map_eq_of_injective (RingHom.injective_int _) g
  have hcard : Multiset.card gC.roots = gC.natDegree := IsAlgClosed.card_roots_eq_natDegree
  have hfac : C gC.leadingCoeff * (gC.roots.map (fun a => X - C a)).prod = gC :=
    C_leadingCoeff_mul_prod_multiset_X_sub_C hcard
  have hroot : ∀ α ∈ gC.roots, 1 < ‖10 - α‖ := by
    intro α hα
    have hα' : gC.eval α = 0 := (mem_roots hgC0).mp hα
    have hg_root : eval₂ (Int.castRingHom ℂ) α g = 0 := by
      rw [← eval_map]
      exact hα'
    have hf_root : eval₂ (Int.castRingHom ℂ) α f = 0 := by
      rw [hgh, eval₂_mul, hg_root, zero_mul]
    by_contra hcon
    have hle : ‖α - 10‖ ≤ 1 := by
      rw [norm_sub_rev]
      exact not_lt.mp hcon
    exact p6_root f hdig hlead α hle hf_root
  have hevC : gC.eval 10 = gC.leadingCoeff * (gC.roots.map (fun a => 10 - a)).prod := by
    conv_lhs => rw [← hfac]
    simp only [eval_mul, eval_C, eval_multiset_prod, Multiset.map_map, Function.comp_def,
      eval_sub, eval_X]
  have hlc : 1 ≤ ‖gC.leadingCoeff‖ := by
    have hlc0 : g.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr hg0
    have e : gC.leadingCoeff = ((g.leadingCoeff : ℤ) : ℂ) := by
      rw [hgC, leadingCoeff_map_of_injective (RingHom.injective_int _)]
      simp
    rw [e, Complex.norm_intCast]
    have h1 : (1 : ℤ) ≤ |g.leadingCoeff| := Int.one_le_abs hlc0
    have h2 : (1 : ℝ) ≤ |(g.leadingCoeff : ℝ)| := by
      have : ((|g.leadingCoeff| : ℤ) : ℝ) = |(g.leadingCoeff : ℝ)| := by
        push_cast
        rfl
      rw [← this]
      exact_mod_cast h1
    exact h2
  have hprod : 1 < ‖(gC.roots.map (fun a => 10 - a)).prod‖ := by
    apply p6_prod_gt
    · intro x hx
      obtain ⟨α, hα, rfl⟩ := Multiset.mem_map.mp hx
      exact hroot α hα
    · intro h0
      have hc := congrArg Multiset.card h0
      rw [Multiset.card_map, Multiset.card_zero, hcard, hdeg] at hc
      omega
  have hval : ((g.eval 10 : ℤ) : ℂ) = gC.eval 10 := by
    have h1 := eval_intCast_map (Int.castRingHom ℂ) g 10
    rw [hgC]
    simpa using h1.symm
  rw [hval, hevC, norm_mul]
  nlinarith [hlc, hprod]

open Polynomial in
theorem problem6 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf0 : f ≠ 0 := by
    rintro rfl
    simp at hp
  have hlead : 1 ≤ f.leadingCoeff := by
    have h1 : f.leadingCoeff ≠ 0 := leadingCoeff_ne_zero.mpr hf0
    have h2 : 0 ≤ f.leadingCoeff := (hdigit f.natDegree).1
    omega
  have key : ∀ g : ℤ[X], g ∣ f → 0 < g.natDegree → 1 < ‖((g.eval 10 : ℤ) : ℂ)‖ := by
    rintro g ⟨h, hgh⟩ hg
    exact p6_key f (fun i => hdigit i) hlead g h hgh hg
  refine ⟨?_, ?_⟩
  · intro hu
    obtain ⟨r, hr, hrf⟩ := Polynomial.isUnit_iff.mp hu
    apply Prime.not_isUnit hp
    rw [← hrf, eval_C]
    exact hr
  · intro a b hab
    have hev : f.eval 10 = a.eval 10 * b.eval 10 := by
      rw [hab, eval_mul]
    rcases (Prime.irreducible hp).isUnit_or_isUnit hev with ha | hb
    · left
      have hdeg : a.natDegree = 0 := by
        by_contra hne
        have hk := key a ⟨b, hab⟩ (Nat.pos_of_ne_zero hne)
        rcases Int.isUnit_iff.mp ha with h1 | h1 <;> rw [h1] at hk <;> norm_num at hk
      have hC : a = C (a.coeff 0) := eq_C_of_natDegree_eq_zero hdeg
      rw [hC, eval_C] at ha
      rw [hC]
      exact isUnit_C.mpr ha
    · right
      have hdeg : b.natDegree = 0 := by
        by_contra hne
        have hk := key b ⟨a, by rw [hab, mul_comm]⟩ (Nat.pos_of_ne_zero hne)
        rcases Int.isUnit_iff.mp hb with h1 | h1 <;> rw [h1] at hk <;> norm_num at hk
      have hC : b = C (b.coeff 0) := eq_C_of_natDegree_eq_zero hdeg
      rw [hC, eval_C] at hb
      rw [hC]
      exact isUnit_C.mpr hb
