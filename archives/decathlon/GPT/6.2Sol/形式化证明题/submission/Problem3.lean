import Mathlib.Analysis.Complex.Polynomial.Basic
import Mathlib.Algebra.Polynomial.Degree.Units
import Mathlib.Data.Int.Order.Units
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Positivity

open Polynomial Finset

private lemma p3_geometric (R : ℝ) (hR : 9 ≤ R) (k : ℕ) :
    ∑ i ∈ Finset.range k, 9 * R ^ i ≤ 2 * R ^ k := by
  induction k with
  | zero => simp
  | succ k ih =>
    rw [Finset.sum_range_succ, pow_succ]
    calc
      _ ≤ 2 * R ^ k + 9 * R ^ k := add_le_add_left ih _
      _ = 11 * R ^ k := by ring
      _ ≤ (2 * R) * R ^ k :=
        mul_le_mul_of_nonneg_right (by linarith) (pow_nonneg (by linarith) _)
      _ = 2 * (R ^ k * R) := by ring

private lemma p3_root_far (f : ℤ[X]) (hf : f ≠ 0)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    {z : ℂ} (hz : (f.map (Int.castRingHom ℂ)).eval z = 0) :
    1 < ‖(10 : ℂ) - z‖ := by
  by_contra! hclose
  have hre : 9 ≤ z.re := by
    have h := (Complex.re_le_norm ((10 : ℂ) - z)).trans hclose
    simp at h
    linarith
  have hR : 9 ≤ ‖z‖ := hre.trans (Complex.re_le_norm z)
  let F := f.map (Int.castRingHom ℂ)
  have hd : F.natDegree = f.natDegree :=
    natDegree_map_eq_of_injective (fun _ _ h => Int.cast_injective (α := ℂ) h) f
  have hcoeff (i : ℕ) : F.coeff i = (f.coeff i : ℂ) := by simp [F]
  change F.eval z = 0 at hz
  cases hn : f.natDegree with
  | zero =>
    have h := (leadingCoeff_ne_zero.mpr hf : f.leadingCoeff ≠ 0)
    rw [← coeff_natDegree, hn] at h
    rw [eval_eq_sum_range' (show F.natDegree < 1 by omega), sum_range_one, pow_zero,
      mul_one, hcoeff, Int.cast_eq_zero] at hz
    exact h hz
  | succ k =>
    let a := f.coeff (k+1)
    let b := f.coeff k
    have ha : 1 ≤ a := by
      have h := (leadingCoeff_ne_zero.mpr hf : f.leadingCoeff ≠ 0)
      rw [← coeff_natDegree, hn] at h
      exact Int.add_one_le_iff.mpr (lt_of_le_of_ne (hdigit (k+1)).1 (Ne.symm h))
    have hb : 0 ≤ b := (hdigit k).1
    let T := ∑ i ∈ Finset.range k, (f.coeff i : ℂ) * z ^ i
    have hT : ‖T‖ ≤ 2 * ‖z‖ ^ k := by
      refine (norm_sum_le _ _).trans ((Finset.sum_le_sum ?_).trans (p3_geometric ‖z‖ hR k))
      intro i hi
      rw [norm_mul, norm_pow, Complex.norm_intCast, abs_of_nonneg]
      · exact mul_le_mul_of_nonneg_right (by exact_mod_cast (hdigit i).2) (by positivity)
      · exact_mod_cast (hdigit i).1
    have hE : T + ((a : ℂ) * z + (b : ℂ)) * z ^ k = 0 := by
      rw [eval_eq_sum_range' (show F.natDegree < k + 2 by omega),
        Finset.sum_range_succ, Finset.sum_range_succ] at hz
      simp only [hcoeff, pow_succ z k] at hz
      dsimp [T, a, b]
      linear_combination hz
    have hL : 9 ≤ ‖(a : ℂ) * z + (b : ℂ)‖ := by
      refine le_trans ?_ (Complex.re_le_norm _)
      simp only [Complex.add_re, Complex.mul_re, Complex.intCast_re, Complex.intCast_im,
        zero_mul, sub_zero]
      have ha' : 1 ≤ (a : ℝ) := by exact_mod_cast ha
      have hb' : 0 ≤ (b : ℝ) := by exact_mod_cast hb
      nlinarith [mul_nonneg (sub_nonneg.mpr ha') (show 0 ≤ z.re by linarith)]
    have hh : ((a : ℂ) * z + (b : ℂ)) * z ^ k = -T := by
      linear_combination hE
    have h := congrArg norm hh
    rw [norm_mul, norm_pow, norm_neg] at h
    have hpos : 0 < ‖z‖ ^ k := pow_pos (by linarith) _
    nlinarith [mul_le_mul_of_nonneg_right hL hpos.le]

private lemma p3_norm_prod (s : Multiset ℂ) (h : ∀ z ∈ s, 1 < ‖(10 : ℂ) - z‖) :
    1 ≤ ‖(s.map fun z => (10 : ℂ) - z).prod‖ ∧
      (s ≠ 0 → 1 < ‖(s.map fun z => (10 : ℂ) - z).prod‖) := by
  induction s using Multiset.induction with
  | empty => simp
  | cons z s ih =>
    have H := (ih (fun y hy => h y (Multiset.mem_cons_of_mem hy))).1
    have hz := h z (Multiset.mem_cons_self _ _)
    simp only [Multiset.map_cons, Multiset.prod_cons, norm_mul]
    have hh : 1 < ‖(10 : ℂ) - z‖ * ‖(s.map fun y => (10 : ℂ) - y).prod‖ :=
      hz.trans_le (le_mul_of_one_le_right (norm_nonneg _) H)
    exact ⟨hh.le, fun _ => hh⟩

private lemma p3_factor (f g : ℤ[X]) (hf : f ≠ 0) (hg : g ∣ f)
    (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hu : IsUnit (g.eval 10)) : IsUnit g := by
  have hgn : g ≠ 0 := by
    intro h
    exact hf (zero_dvd_iff.mp (h ▸ hg))
  by_cases hdeg : g.natDegree = 0
  · have he := eq_C_of_natDegree_eq_zero hdeg
    rw [he, eval_C] at hu
    rw [he]
    exact hu.map C
  let G := g.map (Int.castRingHom ℂ)
  have hi : Function.Injective (Int.castRingHom ℂ) := fun _ _ h => Int.cast_injective h
  have hG : G ≠ 0 := (Polynomial.map_ne_zero_iff hi).mpr hgn
  have hs : G.Splits := IsAlgClosed.splits _
  have hroots : G.roots ≠ 0 := hs.roots_ne_zero (by
    show (g.map (Int.castRingHom ℂ)).natDegree ≠ 0
    rwa [natDegree_map_eq_of_injective hi])
  have hn := (p3_norm_prod G.roots (fun z hz => by
    apply p3_root_far f hf hdigit
    obtain ⟨q, hq⟩ := hg
    rw [hq, Polynomial.map_mul, eval_mul, (mem_roots hG).mp hz, zero_mul])).2 hroots
  have hlead : 1 ≤ ‖G.leadingCoeff‖ := by
    change 1 ≤ ‖(g.map (Int.castRingHom ℂ)).leadingCoeff‖
    rw [leadingCoeff_map_of_injective hi]
    change 1 ≤ ‖(g.leadingCoeff : ℂ)‖
    rw [Complex.norm_intCast, ← Int.cast_abs]
    have hh := leadingCoeff_ne_zero.mpr hgn
    exact_mod_cast (show (1 : ℤ) ≤ |g.leadingCoeff| by
      have h₁ := le_abs_self g.leadingCoeff
      have h₂ := neg_le_abs g.leadingCoeff
      omega)
  have he : ‖G.eval 10‖ = 1 := by
    have h : G.eval 10 = Int.cast (Polynomial.eval (10 : ℤ) g) := by
      simpa [G] using (eval_map_apply (f := Int.castRingHom ℂ) (p := g) (10 : ℤ))
    rw [h, Complex.norm_intCast, ← Int.cast_abs, Int.isUnit_iff_abs_eq.mp hu]
    norm_num
  rw [hs.eval_eq_prod_roots, norm_mul] at he
  have hh := le_mul_of_one_le_left (norm_nonneg ((G.roots.map fun z => (10 : ℂ) - z).prod)) hlead
  linarith

open Polynomial in
theorem problem3 (f : ℤ[X]) (hdigit : ∀ n, 0 ≤ f.coeff n ∧ f.coeff n ≤ 9)
    (hp : Prime (f.eval 10)) : Irreducible f := by
  have hf : f ≠ 0 := by intro h; exact hp.ne_zero (by simp [h])
  refine irreducible_iff.mpr ⟨fun h => hp.not_isUnit (h.map (evalRingHom 10)), ?_⟩
  intro g h hgh
  have he : f.eval 10 = g.eval 10 * h.eval 10 := by rw [hgh, eval_mul]
  rcases hp.irreducible.isUnit_or_isUnit he with hu | hu
  · exact Or.inl (p3_factor f g hf ⟨h, hgh⟩ hdigit hu)
  · exact Or.inr (p3_factor f h hf ⟨g, hgh.trans (mul_comm _ _)⟩ hdigit hu)

#print axioms problem3
