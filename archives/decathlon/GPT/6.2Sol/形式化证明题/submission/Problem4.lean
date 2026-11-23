import Mathlib.Data.Finset.Interval
import Mathlib.Analysis.Convex.Jensen
import Mathlib.Analysis.SpecialFunctions.BinaryEntropy
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Linarith

open Finset Real

variable {α : Type*} [DecidableEq α]

private def p4_rise (B : Finset (Finset α)) (i : α) (x : Finset α) : Finset α :=
  if insert i x ∈ B then x else insert i x

private lemma p4_rise_inj (B : Finset (Finset α)) (i : α) :
    Set.InjOn (p4_rise B i) (↑B) := by
  intro x hx y hy h
  by_cases hx' : insert i x ∈ B <;> by_cases hy' : insert i y ∈ B <;>
    simp only [p4_rise, hx', hy', ite_true, ite_false] at h
  · exact h
  · exact False.elim (hy' (h ▸ hx))
  · exact False.elim (hx' (h.symm ▸ hy))
  · have hx₀ : i ∉ x := fun hi => hx' (by rwa [Finset.insert_eq_of_mem hi])
    have hy₀ : i ∉ y := fun hi => hy' (by rwa [Finset.insert_eq_of_mem hi])
    simpa only [Finset.erase_insert hx₀, Finset.erase_insert hy₀] using
      congrArg (fun s : Finset α => s.erase i) h

private lemma p4_insert_mem_image (B : Finset (Finset α)) (i : α)
    {x : Finset α} (hx : x ∈ B) : insert i x ∈ B.image (p4_rise B i) := by
  by_cases h : insert i x ∈ B
  · exact Finset.mem_image.mpr ⟨insert i x, h, by simp [p4_rise, h]⟩
  · exact Finset.mem_image.mpr ⟨x, hx, by simp [p4_rise, h]⟩

private lemma p4_union_image (B : Finset (Finset α)) (i : α) (y : Finset α)
    (hy : ∀ x ∈ B, x ∪ y ∈ B) :
    ∀ x ∈ B.image (p4_rise B i), x ∪ y ∈ B.image (p4_rise B i) := by
  intro x hx
  obtain ⟨z, hz, rfl⟩ := Finset.mem_image.mp hx
  by_cases h : insert i z ∈ B
  · have hj : insert i (z ∪ y) ∈ B := by simpa [Finset.insert_union] using hy _ h
    exact Finset.mem_image.mpr ⟨z ∪ y, hy z hz, by simp [p4_rise, h, hj]⟩
  · simpa [p4_rise, h, Finset.insert_union] using p4_insert_mem_image B i (hy z hz)

private lemma p4_construct (A : Finset (Finset α)) (G T : Finset α) (hT : T ⊆ G)
    (hG : ∀ a ∈ A, a ⊆ G) (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    ∃ f : Finset α → Finset α,
      Set.InjOn f (↑A) ∧
      (∀ a ∈ A, a ⊆ f a ∧ f a ⊆ G) ∧
      (∀ a ∈ A, ∀ b ∈ A, f a ∪ b ∈ A.image f) ∧
      (∀ a ∈ A, ∀ b ∈ A, b ⊆ f a → b ⊆ a) ∧
      (∀ j ∈ T, ∀ x ∈ A.image f, insert j x ∈ A.image f) := by
  induction T using Finset.induction_on with
  | empty =>
    refine ⟨id, fun _ _ _ _ h => h, fun a ha => ⟨Subset.rfl, hG a ha⟩, ?_, ?_, ?_⟩
    · simpa using hunion
    · exact fun _ _ _ _ h => h
    · simp
  | @insert i T hi ih =>
    have hiG : i ∈ G := hT (Finset.mem_insert_self ..)
    obtain ⟨f, hf, hbound, hstable, hmax, hup⟩ :=
      ih (fun j hj => hT (Finset.mem_insert_of_mem hj))
    let B := A.image f
    let g := p4_rise B i ∘ f
    have him : A.image g = B.image (p4_rise B i) := (Finset.image_image ..).symm
    refine ⟨g, ?_, ?_, ?_, ?_, ?_⟩
    · intro a ha b hb he
      apply hf ha hb
      exact p4_rise_inj B i (Finset.mem_image_of_mem f ha) (Finset.mem_image_of_mem f hb) he
    · intro a ha
      obtain ⟨h₀, h₁⟩ := hbound a ha
      change a ⊆ p4_rise B i (f a) ∧ p4_rise B i (f a) ⊆ G
      by_cases h : insert i (f a) ∈ B
      · simpa [p4_rise, h] using And.intro h₀ h₁
      · simp only [p4_rise, h, ite_false, Finset.insert_subset_iff]
        exact ⟨h₀.trans (Finset.subset_insert ..), hiG, h₁⟩
    · intro a ha b hb
      rw [him]
      have hh : ∀ x ∈ B, x ∪ b ∈ B := by
        intro x hx
        obtain ⟨c, hc, rfl⟩ := Finset.mem_image.mp hx
        exact hstable c hc b hb
      exact p4_union_image B i b hh _ (by rw [← him]; exact Finset.mem_image_of_mem g ha)
    · intro a ha b hb hab
      change b ⊆ p4_rise B i (f a) at hab
      by_cases h : insert i (f a) ∈ B
      · exact hmax a ha b hb (by simpa [p4_rise, h] using hab)
      · simp only [p4_rise, h, ite_false] at hab
        apply hmax a ha b hb
        by_contra hn
        have hib : i ∈ b := by
          by_contra hh
          exact hn (fun j hj => (Finset.mem_insert.mp (hab hj)).resolve_left
            (fun hji => hh (hji ▸ hj)))
        have he : f a ∪ b = insert i (f a) :=
          Subset.antisymm (Finset.union_subset (Finset.subset_insert ..) hab)
            (Finset.insert_subset_iff.mpr ⟨Finset.mem_union_right _ hib, Finset.subset_union_left⟩)
        exact h (he ▸ hstable a ha b hb)
    · intro j hj x hx
      rw [him] at hx ⊢
      obtain ⟨z, hz, rfl⟩ := Finset.mem_image.mp hx
      rcases Finset.mem_insert.mp hj with rfl | hj
      · have he : insert j (p4_rise B j z) = insert j z := by
          by_cases h : insert j z ∈ B <;> simp [p4_rise, h]
        rw [he]
        exact p4_insert_mem_image B j hz
      · have hh : ∀ z ∈ B, z ∪ {j} ∈ B := by
          intro z hz
          simpa only [Finset.union_singleton] using hup j hj z hz
        simpa only [Finset.union_singleton] using p4_union_image B i {j} hh _
          (Finset.mem_image_of_mem _ hz)

private lemma p4_log_split (a b : ℝ) (hb : 0 ≤ b) (hab : b ≤ a) :
    a * log a + b * log b + 2 * b * log 2 ≤ (a + b) * log (a + b) := by
  rcases hb.eq_or_lt with he | hp
  · simp [← he]
  have ha : 0 < a := hp.trans_le hab
  have hpos : 0 < a + b := add_pos ha hp
  let t := b / (a + b)
  have ht : 0 ≤ t := div_nonneg hb hpos.le
  have ht' : t ≤ 1 / 2 := (div_le_iff₀ hpos).mpr (by linarith)
  have h := Real.strictConcave_binEntropy.concaveOn.2
    (show (0 : ℝ) ∈ Set.Icc 0 1 by simp)
    (show (2 : ℝ)⁻¹ ∈ Set.Icc 0 1 by norm_num)
    (show 0 ≤ 1 - 2*t by linarith) (show 0 ≤ 2*t by positivity)
    (show (1-2*t)+2*t=1 by ring)
  simp only [smul_eq_mul, mul_zero, zero_add, Real.binEntropy_zero, Real.binEntropy_two_inv] at h
  rw [show 2*t*(2:ℝ)⁻¹ = t by ring] at h
  have hOne : 1 - t = a / (a+b) := by
    dsimp [t]
    field_simp
    ring
  have hE : (a+b)*Real.binEntropy t =
      (a+b)*log (a+b) - a*log a - b*log b := by
    rw [Real.binEntropy, hOne, Real.log_inv, Real.log_inv]
    dsimp [t]
    rw [Real.log_div hp.ne' hpos.ne', Real.log_div ha.ne' hpos.ne']
    field_simp
    ring
  have hh := mul_le_mul_of_nonneg_left h hpos.le
  have hmul : (a+b)*(2*t*log 2) = 2*b*log 2 := by
    dsimp [t]
    field_simp
  rw [hmul, hE] at hh
  linarith

private lemma p4_lower (G : Finset α) (D : Finset (Finset α))
    (hG : ∀ x ∈ D, x ⊆ G) (hD : ∀ x ∈ D, ∀ y ⊆ x, y ∈ D) :
    2 * (∑ x ∈ D, (x.card : ℝ)) * log 2 ≤ (D.card : ℝ) * log D.card := by
  induction G using Finset.induction_on generalizing D with
  | empty =>
    have hsum : ∑ x ∈ D, (x.card : ℝ) = 0 := by
      apply Finset.sum_eq_zero
      intro x hx
      have he : x = ∅ := Finset.subset_empty.mp (hG x hx)
      simp [he]
    rw [hsum, mul_zero, zero_mul]
    by_cases h : D.card = 0
    · simp [h]
    · exact mul_nonneg (by positivity) (Real.log_nonneg (by exact_mod_cast Nat.one_le_iff_ne_zero.mpr h))
  | @insert i G hi ih =>
    let D₀ := D.filter (fun x => i ∉ x)
    let D₁ := D₀.filter (fun x => insert i x ∈ D)
    have h₀ (x : Finset α) (hx : x ∈ D₀) : x ⊆ G := by
      intro j hj
      exact (Finset.mem_insert.mp (hG x (Finset.mem_filter.mp hx).1 hj)).resolve_left
        (fun hji => (Finset.mem_filter.mp hx).2 (hji ▸ hj))
    have h₀D : ∀ x ∈ D₀, ∀ y ⊆ x, y ∈ D₀ := fun x hx y hy =>
      Finset.mem_filter.mpr ⟨hD x (Finset.mem_filter.mp hx).1 y hy,
        fun h => (Finset.mem_filter.mp hx).2 (hy h)⟩
    have h₁D : ∀ x ∈ D₁, ∀ y ⊆ x, y ∈ D₁ := fun x hx y hy =>
      Finset.mem_filter.mpr ⟨h₀D x (Finset.mem_filter.mp hx).1 y hy,
        hD _ (Finset.mem_filter.mp hx).2 _ (by gcongr)⟩
    have hInj : Set.InjOn (insert i : Finset α → Finset α) (↑D₁) := by
      intro a ha b hb he
      have ha' : i ∉ a := (Finset.mem_filter.mp (Finset.mem_filter.mp (Finset.mem_coe.mp ha)).1).2
      have hb' : i ∉ b := (Finset.mem_filter.mp (Finset.mem_filter.mp (Finset.mem_coe.mp hb)).1).2
      simpa only [Finset.erase_insert ha', Finset.erase_insert hb'] using
        congrArg (fun x : Finset α => x.erase i) he
    have hdecomp : D = D₀ ∪ D₁.image (insert i) := by
      ext x
      constructor
      · intro hx
        by_cases h : i ∈ x
        · apply Finset.mem_union_right
          refine Finset.mem_image.mpr ⟨x.erase i, ?_, Finset.insert_erase h⟩
          exact Finset.mem_filter.mpr ⟨Finset.mem_filter.mpr
            ⟨hD x hx _ (Finset.erase_subset ..), Finset.notMem_erase i x⟩,
            by rwa [Finset.insert_erase h]⟩
        · exact Finset.mem_union_left _ (Finset.mem_filter.mpr ⟨hx, h⟩)
      · intro hx
        rcases Finset.mem_union.mp hx with hx | hx
        · exact (Finset.mem_filter.mp hx).1
        · obtain ⟨y, hy, rfl⟩ := Finset.mem_image.mp hx
          exact (Finset.mem_filter.mp hy).2
    have hdis : Disjoint D₀ (D₁.image (insert i)) := by
      refine Finset.disjoint_left.mpr fun x hx hy => ?_
      obtain ⟨y, hy, rfl⟩ := Finset.mem_image.mp hy
      exact (Finset.mem_filter.mp hx).2 (Finset.mem_insert_self ..)
    have hc : D.card = D₀.card + D₁.card := by
      conv_lhs => rw [hdecomp]
      rw [Finset.card_union_of_disjoint hdis, Finset.card_image_of_injOn hInj]
    have hsum : ∑ x ∈ D, (x.card : ℝ) =
        (∑ x ∈ D₀, (x.card : ℝ)) + (∑ x ∈ D₁, (x.card : ℝ)) + D₁.card := by
      conv_lhs => rw [hdecomp, Finset.sum_union hdis, Finset.sum_image hInj]
      have he : ∑ x ∈ D₁, ((insert i x).card : ℝ) =
          ∑ x ∈ D₁, ((x.card : ℝ) + 1) := by
        apply Finset.sum_congr rfl
        intro x hx
        rw [Finset.card_insert_of_notMem (Finset.mem_filter.mp (Finset.mem_filter.mp hx).1).2,
          Nat.cast_add, Nat.cast_one]
      rw [he, Finset.sum_add_distrib, Finset.sum_const, nsmul_one]
      ring
    have hle : D₁.card ≤ D₀.card := Finset.card_le_card (Finset.filter_subset ..)
    have h₀' := ih D₀ h₀ h₀D
    have h₁' := ih D₁ (fun x hx => h₀ x (Finset.mem_filter.mp hx).1) h₁D
    have h := p4_log_split (D₀.card : ℝ) D₁.card (Nat.cast_nonneg _) (by exact_mod_cast hle)
    rw [hsum, hc, Nat.cast_add]
    linarith

theorem problem4 {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  classical
  let G := A.biUnion id
  have hG : ∀ a ∈ A, a ⊆ G := fun a ha i hi => Finset.mem_biUnion.mpr ⟨a, ha, hi⟩
  obtain ⟨f, hinj, hbound, _, hmax, hup⟩ := p4_construct A G G Subset.rfl hG hunion
  let B := A.image f
  have hupper (x y : Finset α) (hx : x ∈ B) (hxy : x ⊆ y) (hy : y ⊆ G) : y ∈ B := by
    have hu (t : Finset α) (ht : t ⊆ G) : x ∪ t ∈ B := by
      induction t using Finset.induction_on with
      | empty => simpa using hx
      | @insert i s hi ih =>
        rw [Finset.union_insert]
        exact hup i (ht (Finset.mem_insert_self ..)) _ (ih (fun j hj => ht (Finset.mem_insert_of_mem hj)))
    simpa [Finset.union_eq_right.mpr hxy] using hu y hy
  let g : Finset α → Finset α := fun a => G \ f a
  let D := A.image g
  have hginj : Set.InjOn g (↑A) := by
    intro a ha b hb he
    apply hinj ha hb
    simpa only [g, Finset.sdiff_sdiff_eq_self (hbound a ha).2,
      Finset.sdiff_sdiff_eq_self (hbound b hb).2] using congrArg (fun x => G \ x) he
  have hD : ∀ x ∈ D, ∀ y ⊆ x, y ∈ D := by
    intro x hx y hy
    obtain ⟨a, ha, rfl⟩ := Finset.mem_image.mp hx
    have hyG := hy.trans (Finset.sdiff_subset : g a ⊆ G)
    have hfa : f a ⊆ G \ y := by
      intro j hj
      exact Finset.mem_sdiff.mpr ⟨(hbound a ha).2 hj, fun hjy => (Finset.mem_sdiff.mp (hy hjy)).2 hj⟩
    obtain ⟨b, hb, he⟩ := Finset.mem_image.mp (hupper (f a) (G \ y)
      (Finset.mem_image_of_mem f ha) hfa Finset.sdiff_subset)
    exact Finset.mem_image.mpr ⟨b, hb, by simp [g, he, Finset.sdiff_sdiff_eq_self hyG]⟩
  have hlow := p4_lower G D (by
    intro x hx
    obtain ⟨a, ha, rfl⟩ := Finset.mem_image.mp hx
    exact Finset.sdiff_subset) hD
  change 2 * (∑ x ∈ A.image g, (x.card : ℝ)) * log 2 ≤
    ((A.image g).card : ℝ) * log (A.image g).card at hlow
  rw [Finset.sum_image hginj, Finset.card_image_of_injOn hginj] at hlow
  let k : Finset α → ℕ := fun a => (f a).card - a.card
  have hcount : ∑ a ∈ A, 2 ^ k a ≤ 2 ^ G.card := by
    let I := fun a => Finset.Icc a (f a)
    have hd : (↑A : Set (Finset α)).PairwiseDisjoint I := by
      intro a ha b hb hab
      apply Finset.disjoint_left.mpr
      intro x hx hy
      have hx' := Finset.mem_Icc.mp hx
      have hy' := Finset.mem_Icc.mp hy
      exact hab (Subset.antisymm (hmax b hb a ha (hx'.1.trans hy'.2))
        (hmax a ha b hb (hy'.1.trans hx'.2)))
    have hsub : A.biUnion I ⊆ G.powerset := by
      intro x hx
      obtain ⟨a, ha, hax⟩ := Finset.mem_biUnion.mp hx
      exact Finset.mem_powerset.mpr ((Finset.mem_Icc.mp hax).2.trans (hbound a ha).2)
    have h := Finset.card_le_card hsub
    rw [Finset.card_biUnion hd, Finset.card_powerset] at h
    convert h using 1
    apply Finset.sum_congr rfl
    intro a ha
    exact (Finset.card_Icc_finset (hbound a ha).1).symm
  let M : ℝ := A.card
  have hm : 0 < M := Nat.cast_pos.mpr hA.card_pos
  have hsum : ∑ a ∈ A, (M⁻¹ : ℝ) = 1 := by simp [M, hm.ne']
  have hj := strictConcaveOn_log_Ioi.concaveOn.le_map_sum
    (t := A) (w := fun _ => M⁻¹) (p := fun a => (2 : ℝ) ^ k a)
    (fun _ _ => inv_nonneg.mpr hm.le) hsum (fun a _ =>
      show (2 : ℝ) ^ k a ∈ Set.Ioi (0 : ℝ) from pow_pos (by norm_num : (0 : ℝ) < 2) _)
  simp only [smul_eq_mul, Real.log_pow, ← Finset.mul_sum, ← Finset.sum_mul] at hj
  have hcount' : ∑ a ∈ A, (2 : ℝ) ^ k a ≤ 2 ^ G.card := by exact_mod_cast hcount
  have hpos : 0 < M⁻¹ * ∑ a ∈ A, (2 : ℝ) ^ k a :=
    mul_pos (inv_pos.mpr hm) (Finset.sum_pos (fun _ _ => by positivity) hA)
  have hl := hj.trans (Real.log_le_log hpos (mul_le_mul_of_nonneg_left hcount' (by positivity)))
  rw [Real.log_mul (inv_ne_zero hm.ne') (by positivity), Real.log_inv, Real.log_pow] at hl
  have hJ : M * log M + (∑ a ∈ A, (k a : ℝ)) * log 2 ≤ M * G.card * log 2 := by
    have h := mul_le_mul_of_nonneg_left hl hm.le
    rw [← mul_assoc M M⁻¹, mul_inv_cancel₀ hm.ne', one_mul] at h
    linarith
  have ht : (∑ a ∈ A, (g a).card : ℝ) + (∑ a ∈ A, (k a : ℝ)) +
      (∑ a ∈ A, (a.card : ℝ)) = M * G.card := by
    rw [← Finset.sum_add_distrib, ← Finset.sum_add_distrib]
    have hh : ∀ a ∈ A, ((g a).card : ℝ) + (k a : ℝ) + a.card = G.card := by
      intro a ha
      rw [show (g a).card = G.card - (f a).card from Finset.card_sdiff_of_subset (hbound a ha).2]
      dsimp [k]
      rw [Nat.cast_sub (Finset.card_le_card (hbound a ha).2),
        Nat.cast_sub (Finset.card_le_card (hbound a ha).1)]
      ring
    simp [Finset.sum_congr rfl hh, M]
  have hM : M * log M ≤ (2 * ∑ a ∈ A, (a.card : ℝ)) * log 2 := by
    change 2 * (∑ a ∈ A, ((g a).card : ℝ)) * log 2 ≤ M * log M at hlow
    nlinarith [congrArg (fun x : ℝ => x * log 2) ht]
  have hf : M ^ A.card ≤ (2 : ℝ) ^ (2 * ∑ a ∈ A, a.card) := by
    apply (Real.log_le_log_iff (by positivity) (by positivity)).mp
    rw [Real.log_pow, Real.log_pow]
    push_cast
    exact hM
  dsimp [M] at hf
  exact_mod_cast hf

#print axioms problem4
