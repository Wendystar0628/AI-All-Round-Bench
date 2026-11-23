import Mathlib

open Polynomial

lemma p6_root_far (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf0 : f ≠ 0)
    (α : ℂ) (hα : aeval α f = 0) : 1 < ‖(10:ℂ) - α‖ := by
  by_contra hlt
  rw [not_lt] at hlt
  have hre : 9 ≤ α.re := by
    have h1 : ((10:ℂ) - α).re ≤ ‖(10:ℂ) - α‖ := Complex.re_le_norm _
    have h2 : ((10:ℂ) - α).re = 10 - α.re := by simp
    linarith
  have hnorm : 9 ≤ ‖α‖ := by
    have h1 : α.re ≤ ‖α‖ := Complex.re_le_norm _
    linarith
  rw [aeval_eq_sum_range] at hα
  rcases Nat.eq_zero_or_pos f.natDegree with h0 | hpos
  · -- constant polynomial
    apply hf0
    rw [h0] at hα
    simp at hα
    have : f = C (f.coeff 0) := eq_C_of_natDegree_eq_zero h0
    rw [this, hα]
    simp
  · obtain ⟨k, hk⟩ : ∃ k, f.natDegree = k + 1 := ⟨f.natDegree - 1, by omega⟩
    rw [hk, Finset.sum_range_succ, Finset.sum_range_succ] at hα
    set ρ := ‖α‖ with hρ
    have hρ9 : 9 ≤ ρ := hnorm
    have hρpos : 0 < ρ := by linarith
    have hcoef_nonneg : ∀ i, (0:ℝ) ≤ (f.coeff i : ℝ) := fun i => by exact_mod_cast (hdigit i).1
    have hcoef_le : ∀ i, (f.coeff i : ℝ) ≤ 9 := fun i => by exact_mod_cast (hdigit i).2
    have hlead : 1 ≤ f.coeff (k+1) := by
      have : f.coeff (k+1) ≠ 0 := by
        have := (mt (Polynomial.leadingCoeff_eq_zero (p := f)).mp) hf0
        rw [Polynomial.leadingCoeff, hk] at this
        exact this
      have := (hdigit (k+1)).1
      omega
    have hlead' : (1:ℝ) ≤ (f.coeff (k+1) : ℝ) := by exact_mod_cast hlead
    -- the lower bound
    have hsum : ∑ i ∈ Finset.range k, f.coeff i • α ^ i
        = -(f.coeff k • α ^ k + f.coeff (k+1) • α ^ (k+1)) := by
      linear_combination hα
    have hlow : 9 * ρ ^ k ≤ ‖f.coeff k • α ^ k + f.coeff (k+1) • α ^ (k+1)‖ := by
      have : f.coeff k • α ^ k + f.coeff (k+1) • α ^ (k+1)
          = α ^ k * ((f.coeff k : ℂ) + (f.coeff (k+1) : ℂ) * α) := by
        simp only [zsmul_eq_mul]; ring
      rw [this, norm_mul, norm_pow, ← hρ]
      have h1 : (9:ℝ) ≤ ‖(f.coeff k : ℂ) + (f.coeff (k+1) : ℂ) * α‖ := by
        have h2 : (((f.coeff k : ℂ) + (f.coeff (k+1) : ℂ) * α)).re ≤ _ := Complex.re_le_norm _
        refine le_trans ?_ h2
        simp only [Complex.add_re, Complex.mul_re, Complex.intCast_re, Complex.intCast_im,
          zero_mul, sub_zero]
        have := hcoef_nonneg k
        nlinarith
      nlinarith [pow_pos hρpos k]
    have hup : ‖∑ i ∈ Finset.range k, f.coeff i • α ^ i‖ ≤ 9 * ∑ i ∈ Finset.range k, ρ ^ i := by
      refine (norm_sum_le _ _).trans ?_
      rw [Finset.mul_sum]
      refine Finset.sum_le_sum fun i _ => ?_
      rw [zsmul_eq_mul, norm_mul, norm_pow, ← hρ]
      have : ‖(f.coeff i : ℂ)‖ ≤ 9 := by
        rw [Complex.norm_intCast]
        have := hdigit i
        have h1 : |(f.coeff i : ℝ)| = (f.coeff i : ℝ) := abs_of_nonneg (hcoef_nonneg i)
        rw [h1]; exact hcoef_le i
      exact mul_le_mul_of_nonneg_right this (pow_nonneg hρpos.le _)
    have hgeom : (∑ i ∈ Finset.range k, ρ ^ i) * (ρ - 1) = ρ ^ k - 1 := geom_sum_mul ρ k
    have hgeom_nonneg : 0 ≤ ∑ i ∈ Finset.range k, ρ ^ i :=
      Finset.sum_nonneg fun i _ => pow_nonneg hρpos.le _
    have h8 : 8 * ∑ i ∈ Finset.range k, ρ ^ i ≤ ρ ^ k := by
      nlinarith [pow_pos hρpos k]
    rw [hsum, norm_neg] at hup
    have : 9 * ρ ^ k ≤ 9 / 8 * ρ ^ k := by nlinarith
    nlinarith [pow_pos hρpos k]

lemma p6_multiset_norm (s : Multiset ℂ) (h : ∀ a ∈ s, 1 < ‖a‖) : 1 ≤ ‖s.prod‖ := by
  induction s using Multiset.induction_on with
  | empty => simp
  | cons a t ih =>
    rw [Multiset.prod_cons, norm_mul]
    have h1 : 1 < ‖a‖ := h a (Multiset.mem_cons_self a t)
    have h2 : 1 ≤ ‖t.prod‖ := ih fun b hb => h b (Multiset.mem_cons_of_mem hb)
    nlinarith

lemma p6_multiset_norm' (a : ℂ) (t : Multiset ℂ) (h : ∀ b ∈ a ::ₘ t, 1 < ‖b‖) :
    1 < ‖(a ::ₘ t).prod‖ := by
  rw [Multiset.prod_cons, norm_mul]
  have h1 : 1 < ‖a‖ := h a (Multiset.mem_cons_self a t)
  have h2 : 1 ≤ ‖t.prod‖ := p6_multiset_norm t fun b hb => h b (Multiset.mem_cons_of_mem hb)
  nlinarith

lemma p6_unit_of_dvd (f g : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9) (hf0 : f ≠ 0)
    (hdvd : g ∣ f) (hu : IsUnit (g.eval 10)) : IsUnit g := by
  by_cases hdeg : g.natDegree = 0
  · have hg : g = C (g.coeff 0) := eq_C_of_natDegree_eq_zero hdeg
    have h1 : g.eval 10 = g.coeff 0 := by
      conv_lhs => rw [hg]
      simp
    rw [h1] at hu
    rw [Polynomial.isUnit_iff]
    exact ⟨g.coeff 0, hu, hg.symm⟩
  · exfalso
    have hg0 : g ≠ 0 := fun h => hdeg (by simp [h])
    set gc : ℂ[X] := g.map (algebraMap ℤ ℂ) with hgc
    set fc : ℂ[X] := f.map (algebraMap ℤ ℂ) with hfc
    have hinj : Function.Injective (algebraMap ℤ ℂ) := fun a b h => by simpa using h
    have hcard : gc.roots.card = g.natDegree :=
      IsAlgClosed.card_roots_map_eq_natDegree_of_injective g hinj
    have hnd : gc.natDegree = g.natDegree := natDegree_map_eq_of_injective hinj g
    have hprod := C_leadingCoeff_mul_prod_multiset_X_sub_C (p := gc) (by rw [hcard, hnd])
    have hev : eval (10:ℂ) gc = ((g.eval 10 : ℤ) : ℂ) := by
      rw [hgc, eval_map_algebraMap]
      have := aeval_algebraMap_apply_eq_algebraMap_eval (A := ℂ) (10:ℤ) g
      simpa using this
    have hdvdc : gc ∣ fc := Polynomial.map_dvd _ hdvd
    have hfc0 : fc ≠ 0 := by
      rw [hfc]; exact (Polynomial.map_ne_zero_iff hinj).mpr hf0
    have hroots : ∀ a ∈ gc.roots, 1 < ‖(10:ℂ) - a‖ := by
      intro a ha
      have hroot : gc.IsRoot a := (mem_roots (by rw [hgc]; exact (Polynomial.map_ne_zero_iff hinj).mpr hg0)).mp ha
      have hroot' : fc.IsRoot a := by
        obtain ⟨q, hq⟩ := hdvdc
        rw [hq]; simp [IsRoot.def.mp hroot]
      apply p6_root_far f hdigit hf0 a
      have : aeval a f = eval a fc := by rw [hfc, eval_map_algebraMap]
      rw [this]; exact hroot'
    have hnorm_eq : ‖((g.eval 10 : ℤ) : ℂ)‖ = ‖gc.leadingCoeff‖ * ‖(gc.roots.map (fun a => (10:ℂ) - a)).prod‖ := by
      rw [← hev]
      conv_lhs => rw [← hprod]
      rw [eval_mul, eval_C, eval_multiset_prod, Multiset.map_map, norm_mul]
      have hm : Multiset.map (eval (10:ℂ) ∘ fun a => X - C a) gc.roots
          = Multiset.map (fun a => (10:ℂ) - a) gc.roots := by
        apply Multiset.map_congr rfl
        intro a _
        simp
      rw [hm]
    have hone : ‖((g.eval 10 : ℤ) : ℂ)‖ = 1 := by
      rw [Complex.norm_intCast]
      have := Int.isUnit_iff.mp hu
      rcases this with h | h <;> simp [h]
    have hlead : 1 ≤ ‖gc.leadingCoeff‖ := by
      have hne : gc.leadingCoeff ≠ 0 := by
        rw [Ne, leadingCoeff_eq_zero]
        rw [hgc]; exact (Polynomial.map_ne_zero_iff hinj).mpr hg0
      have hlc : gc.leadingCoeff = ((g.leadingCoeff : ℤ) : ℂ) := by
        rw [hgc, leadingCoeff_map_of_injective hinj]; simp
      rw [hlc] at hne ⊢
      rw [Complex.norm_intCast]
      have : g.leadingCoeff ≠ 0 := by exact_mod_cast hne
      have h1 : (1:ℤ) ≤ |g.leadingCoeff| := Int.one_le_abs this
      exact_mod_cast h1
    have hmpos : 1 < ‖(gc.roots.map (fun a => (10:ℂ) - a)).prod‖ := by
      have hne : gc.roots ≠ 0 := by
        intro h0
        rw [h0] at hcard
        simp at hcard
        exact hdeg hcard.symm
      obtain ⟨a, ha⟩ := Multiset.exists_mem_of_ne_zero hne
      obtain ⟨t, hat⟩ := Multiset.exists_cons_of_mem ha
      have := p6_multiset_norm' ((10:ℂ) - a) (t.map (fun a => (10:ℂ) - a)) ?_
      · rw [hat]; simpa using this
      · intro b hb
        have hb' : b ∈ gc.roots.map (fun a => (10:ℂ) - a) := by
          rw [hat]; simpa using hb
        obtain ⟨c, hc, rfl⟩ := Multiset.mem_map.mp hb'
        exact hroots c hc
    rw [hone] at hnorm_eq
    nlinarith

open Polynomial in
theorem problem6 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf0 : f ≠ 0 := by
    rintro rfl
    simp at hp
  refine ⟨?_, ?_⟩
  · intro hu
    exact hp.not_isUnit (hu.map (evalRingHom 10))
  · intro g h hfgh
    have hev : f.eval 10 = g.eval 10 * h.eval 10 := by rw [hfgh, eval_mul]
    rcases hp.irreducible.isUnit_or_isUnit hev with hg | hh
    · left
      exact p6_unit_of_dvd f g hdigit hf0 ⟨h, hfgh⟩ hg
    · right
      exact p6_unit_of_dvd f h hdigit hf0 (Dvd.intro_left g hfgh.symm) hh
