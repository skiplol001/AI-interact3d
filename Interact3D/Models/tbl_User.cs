using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Interact3D.Models;

[Table("tbl_User")]
public class tbl_User
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string Username { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Email { get; set; }

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = "User"; // "User", "Admin"

    [MaxLength(255)]
    public string? AvatarUrl { get; set; }

    public int StorageQuotaMB { get; set; } = 500;
    public int StorageUsedMB { get; set; } = 0;
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    // Navigation properties
    public virtual ICollection<tbl_Model3D> Models { get; set; } = new List<tbl_Model3D>();
    public virtual ICollection<tbl_ModelPosition> Positions { get; set; } = new List<tbl_ModelPosition>();
}