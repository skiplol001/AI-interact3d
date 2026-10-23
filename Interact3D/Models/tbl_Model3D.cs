using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Interact3D.Models;

[Table("tbl_Model3D")]
public class tbl_Model3D
{
    [Key]
    public int Id { get; set; }

    public int? UserId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [Required]
    [MaxLength(255)]
    public string FilePath { get; set; } = string.Empty;

    [Column(TypeName = "decimal(10,2)")]
    public decimal FileSizeMB { get; set; } = 0;

    [MaxLength(255)]
    public string? ThumbnailUrl { get; set; }

    [MaxLength(30)]
    public string? BoneStandard { get; set; } // "Mixamo", "Generic", "None"

    public int? BoneCount { get; set; }
    public bool HasAnimation { get; set; } = false;
    public bool IsSystem { get; set; } = false;
    public bool IsPublic { get; set; } = false;
    public bool IsDeleted { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    // Navigation properties
    [ForeignKey(nameof(UserId))]
    public virtual tbl_User? User { get; set; }
    public virtual ICollection<tbl_ModelPosition> Positions { get; set; } = new List<tbl_ModelPosition>();
}